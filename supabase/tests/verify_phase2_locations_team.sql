-- ==============================================================================
-- PointPass Phase 2: Locations & Team Pre-Deployment Certification Suite
-- Real PostgreSQL role switching under "anon" and "authenticated".
-- Executes inside a transaction with automatic ROLLBACK so zero test data remains.
-- Fully self-contained: establishes Phase 2 DDL in-transaction so it can be run
-- before or after migration application.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. Establish Phase 2 DDL in Transaction (Rolls back automatically at the end)
-- ------------------------------------------------------------------------------

-- 1. Safe PIN-configured status projection
create or replace function public.operations_staff_pin_status(_business_id uuid)
returns table (staff_id uuid, pin_configured boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.can_manage_business(auth.uid(), _business_id)
    or exists (
      select 1 from public.branches b
      where b.business_id = _business_id
        and public.can_manage_branch(auth.uid(), b.id)
    )
  ) then
    raise exception 'Access denied to business staff PIN status';
  end if;

  return query
  select
    s.id as staff_id,
    exists(
      select 1 from public.staff_cashier_credentials c
      where c.staff_id = s.id
    ) as pin_configured
  from public.staff_members s
  where s.business_id = _business_id
    and public.user_can_access_staff(auth.uid(), s.id);
end;
$$;

revoke all on function public.operations_staff_pin_status(uuid) from public, anon;
grant execute on function public.operations_staff_pin_status(uuid) to authenticated, service_role;

-- 2. Safe internal code generator helpers
create or replace function public.generate_branch_code(
  _business_id uuid,
  _name text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _base text;
  _candidate text;
  _idx integer := 1;
begin
  if auth.uid() is not null and not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Access denied to generate branch code';
  end if;

  _base := lower(regexp_replace(coalesce(trim(_name), ''), '[^a-zA-Z0-9]+', '-', 'g'));
  _base := trim(both '-' from _base);
  if length(_base) < 2 or length(_base) > 24 then
    _base := 'loc';
  end if;

  _candidate := _base;
  while exists (
    select 1 from public.branches
    where business_id = _business_id and lower(code) = _candidate
  ) loop
    _idx := _idx + 1;
    _candidate := _base || '-' || _idx::text;
    if _idx > 100 then
      _candidate := _base || '-' || substr(md5(random()::text), 1, 4);
      exit;
    end if;
  end loop;

  return _candidate;
end;
$$;

create or replace function public.generate_staff_code(
  _business_id uuid,
  _role text default 'cashier',
  _name text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _prefix text := case when lower(_role) = 'manager' then 'mgr' else 'csh' end;
  _candidate text;
  _idx integer := 1;
begin
  if auth.uid() is not null and not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Access denied to generate staff code';
  end if;

  _candidate := _prefix || '-' || _idx::text;
  while exists (
    select 1 from public.staff_members
    where business_id = _business_id and lower(code) = _candidate
  ) loop
    _idx := _idx + 1;
    _candidate := _prefix || '-' || _idx::text;
    if _idx > 100 then
      _candidate := _prefix || '-' || substr(md5(random()::text), 1, 4);
      exit;
    end if;
  end loop;

  return _candidate;
end;
$$;

revoke all on function public.generate_branch_code(uuid, text) from public, anon, authenticated;
grant execute on function public.generate_branch_code(uuid, text) to service_role;

revoke all on function public.generate_staff_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.generate_staff_code(uuid, text, text) to service_role;

-- 3. Enhance operations_upsert_branch
create or replace function public.operations_upsert_branch(
  _business_id uuid,
  _branch_id uuid,
  _code text,
  _name_ar text,
  _name_en text,
  _address_ar text default null,
  _address_en text default null,
  _status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
  _clean_code text := lower(trim(coalesce(_code, '')));
begin
  if _branch_id is null then
    if not public.can_manage_business(auth.uid(), _business_id) then
      raise exception 'Branch creation denied';
    end if;
    if _clean_code = '' then
      _clean_code := public.generate_branch_code(_business_id, coalesce(_name_en, _name_ar));
    end if;
  else
    if not exists (
      select 1 from public.branches b
      where b.id = _branch_id and b.business_id = _business_id
        and public.can_manage_branch(auth.uid(), b.id)
    ) then
      raise exception 'Branch update denied';
    end if;
    if _clean_code = '' then
      select code into _clean_code
      from public.branches
      where id = _branch_id and business_id = _business_id;
    end if;
  end if;

  if _clean_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or length(trim(_name_ar)) not between 2 and 120
    or length(trim(_name_en)) not between 2 and 120
    or _status not in ('active', 'inactive') then
    raise exception 'Invalid branch details';
  end if;

  if _branch_id is null then
    insert into public.branches (
      business_id, code, name_ar, name_en, address_ar, address_en, status
    ) values (
      _business_id, _clean_code, trim(_name_ar), trim(_name_en),
      nullif(trim(_address_ar), ''), nullif(trim(_address_en), ''), _status
    ) returning id into _id;
  else
    update public.branches
    set code = _clean_code,
        name_ar = trim(_name_ar),
        name_en = trim(_name_en),
        address_ar = nullif(trim(_address_ar), ''),
        address_en = nullif(trim(_address_en), ''),
        status = _status,
        updated_at = now()
    where id = _branch_id and business_id = _business_id
    returning id into _id;
  end if;

  return _id;
end;
$$;

revoke all on function public.operations_upsert_branch(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.operations_upsert_branch(uuid, uuid, text, text, text, text, text, text) to authenticated, service_role;

-- 4. Transactional team member creation & edit RPC
create or replace function public.operations_save_team_member(
  _business_id uuid,
  _staff_id uuid default null,
  _code text default null,
  _name_ar text default null,
  _name_en text default null,
  _email text default null,
  _role text default 'cashier',
  _status text default 'active',
  _pin text default null,
  _branch_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  _id uuid;
  _clean_code text := lower(trim(coalesce(_code, '')));
  _b_id uuid;
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Staff management denied';
  end if;

  -- Auto-generate internal code if not provided
  if _clean_code = '' then
    if _staff_id is not null then
      select code into _clean_code
      from public.staff_members
      where id = _staff_id and business_id = _business_id;
    else
      _clean_code := public.generate_staff_code(_business_id, _role, coalesce(_name_en, _name_ar));
    end if;
  end if;

  -- Delegate to operations_upsert_staff to preserve all Phase 1 backend validations & RLS
  _id := public.operations_upsert_staff(
    _business_id => _business_id,
    _staff_id => _staff_id,
    _code => _clean_code,
    _name_ar => _name_ar,
    _name_en => _name_en,
    _email => _email,
    _role => _role,
    _status => _status,
    _pin => _pin
  );

  -- Validate all branch_ids belong to the business
  if _branch_ids is not null and array_length(_branch_ids, 1) > 0 then
    foreach _b_id in array _branch_ids loop
      if not exists (
        select 1 from public.branches
        where id = _b_id and business_id = _business_id
      ) then
        raise exception 'Branch % does not belong to business', _b_id;
      end if;
    end loop;
  end if;

  -- Synchronize assignments atomically:
  -- Revoke active cashier sessions for any branch assignments being removed
  update public.cashier_sessions
  set revoked_at = coalesce(revoked_at, now()),
      revoked_by = auth.uid()
  where business_id = _business_id
    and staff_id = _id
    and branch_id in (
      select branch_id from public.staff_branch_assignments
      where business_id = _business_id and staff_id = _id
        and (_branch_ids is null or branch_id <> all(_branch_ids))
    )
    and revoked_at is null;

  delete from public.staff_branch_assignments
  where business_id = _business_id
    and staff_id = _id
    and (_branch_ids is null or branch_id <> all(_branch_ids));

  if _branch_ids is not null and array_length(_branch_ids, 1) > 0 then
    insert into public.staff_branch_assignments (business_id, staff_id, branch_id, assigned_by)
    select _business_id, _id, unnest(_branch_ids), auth.uid()
    on conflict (staff_id, branch_id) do nothing;
  end if;

  return _id;
end;
$$;

revoke all on function public.operations_save_team_member(uuid, uuid, text, text, text, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.operations_save_team_member(uuid, uuid, text, text, text, text, text, text, text, uuid[]) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 1. Setup Context Registry and Mock Fixtures (Privileged Execution)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE pg_temp.test_context (
  key text PRIMARY KEY,
  val uuid NOT NULL
);
GRANT ALL ON pg_temp.test_context TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.get_ctx(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT val FROM pg_temp.test_context WHERE key = p_key;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.get_ctx(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.set_test_auth(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.set_test_auth(uuid) TO anon, authenticated;

DO $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_manager_id uuid := gen_random_uuid();
  v_cashier_id uuid := gen_random_uuid();
  v_cross_user_id uuid := gen_random_uuid();

  v_biz_id uuid := gen_random_uuid();
  v_cross_biz_id uuid := gen_random_uuid();

  v_branch_a_id uuid;
  v_branch_b_id uuid;
  v_cross_branch_id uuid;

  v_staff_mgr_id uuid;
  v_staff_csh_id uuid;
  v_staff_b_only_id uuid;
  v_session_id uuid := gen_random_uuid();
BEGIN
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Starting Phase 2 Locations & Team Certification Suite';
  RAISE NOTICE 'Phase: Privileged Setup and Mock Fixtures';
  RAISE NOTICE '==============================================================';

  -- A. Referencing users in auth.users
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_owner_id, 'owner_p2@test.local', '{}'::jsonb),
    (v_manager_id, 'manager_p2@test.local', '{}'::jsonb),
    (v_cashier_id, 'cashier_p2@test.local', '{}'::jsonb),
    (v_cross_user_id, 'cross_user_p2@test.local', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- B. Businesses (multi_location plan)
  INSERT INTO public.businesses (id, owner_id, slug, name_ar, name_en, plan, status)
  VALUES
    (v_biz_id, v_owner_id, 'p2-biz-' || substr(gen_random_uuid()::text, 1, 8), 'تجارة ف2', 'Phase2 Business', 'multi_location', 'active'),
    (v_cross_biz_id, v_cross_user_id, 'p2-cross-' || substr(gen_random_uuid()::text, 1, 8), 'منافس ف2', 'Phase2 Competitor', 'multi_location', 'active');

  -- C. Branches for primary business
  SELECT id INTO v_branch_a_id FROM public.branches WHERE business_id = v_biz_id LIMIT 1;
  UPDATE public.branches SET code = 'branch-a', name_ar = 'فرع أ', name_en = 'Branch A' WHERE id = v_branch_a_id;

  INSERT INTO public.branches (business_id, code, name_ar, name_en, status)
  VALUES (v_biz_id, 'branch-b', 'فرع ب', 'Branch B', 'active')
  RETURNING id INTO v_branch_b_id;

  SELECT id INTO v_cross_branch_id FROM public.branches WHERE business_id = v_cross_biz_id LIMIT 1;

  -- D. Staff Members
  -- Manager assigned to Branch A
  INSERT INTO public.staff_members (business_id, auth_user_id, code, name_ar, name_en, email, role, status)
  VALUES (v_biz_id, v_manager_id, 'mgr-1', 'مدير فرع أ', 'Manager Branch A', 'manager_p2@test.local', 'manager', 'active')
  RETURNING id INTO v_staff_mgr_id;

  INSERT INTO public.staff_branch_assignments (business_id, staff_id, branch_id, assigned_by)
  VALUES (v_biz_id, v_staff_mgr_id, v_branch_a_id, v_owner_id);

  -- Cashier assigned to Branch A with PIN
  INSERT INTO public.staff_members (business_id, auth_user_id, code, name_ar, name_en, email, role, status)
  VALUES (v_biz_id, v_cashier_id, 'csh-1', 'كاشير فرع أ', 'Cashier Branch A', 'cashier_p2@test.local', 'cashier', 'active')
  RETURNING id INTO v_staff_csh_id;

  INSERT INTO public.staff_branch_assignments (business_id, staff_id, branch_id, assigned_by)
  VALUES (v_biz_id, v_staff_csh_id, v_branch_a_id, v_owner_id);

  INSERT INTO public.staff_cashier_credentials (staff_id, business_id, pin_hash)
  VALUES (v_staff_csh_id, v_biz_id, extensions.crypt('1234', extensions.gen_salt('bf', 10)));

  -- Cashier assigned ONLY to Branch B without PIN
  INSERT INTO public.staff_members (business_id, auth_user_id, code, name_ar, name_en, email, role, status)
  VALUES (v_biz_id, null, 'csh-2', 'كاشير فرع ب', 'Cashier Branch B', null, 'cashier', 'active')
  RETURNING id INTO v_staff_b_only_id;

  INSERT INTO public.staff_branch_assignments (business_id, staff_id, branch_id, assigned_by)
  VALUES (v_biz_id, v_staff_b_only_id, v_branch_b_id, v_owner_id);

  -- E. Cashier session for revocation test (created in privileged context)
  INSERT INTO public.cashier_sessions (id, business_id, branch_id, staff_id, token_hash, expires_at)
  VALUES (v_session_id, v_biz_id, v_branch_a_id, v_staff_csh_id, 'dummy_token_hash_test_p2', now() + interval '8 hours');

  -- Store all in test_context
  INSERT INTO pg_temp.test_context (key, val) VALUES
    ('owner_id', v_owner_id),
    ('manager_id', v_manager_id),
    ('cashier_id', v_cashier_id),
    ('cross_user_id', v_cross_user_id),
    ('biz_id', v_biz_id),
    ('cross_biz_id', v_cross_biz_id),
    ('branch_a_id', v_branch_a_id),
    ('branch_b_id', v_branch_b_id),
    ('cross_branch_id', v_cross_branch_id),
    ('staff_mgr_id', v_staff_mgr_id),
    ('staff_csh_id', v_staff_csh_id),
    ('staff_b_only_id', v_staff_b_only_id),
    ('session_id', v_session_id);

  RAISE NOTICE 'Privileged setup completed successfully.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. UNAUTHENTICATED / ANON ROLE EXECUTION
-- ------------------------------------------------------------------------------
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_biz_id uuid := pg_temp.get_ctx('biz_id');
  v_error_thrown boolean;
  v_error_msg text;
BEGIN
  IF current_user <> 'anon' THEN
    RAISE EXCEPTION 'Test environment error: current_user is % instead of anon', current_user;
  END IF;

  RAISE NOTICE '[ANON TESTS] Verifying anonymous callers cannot execute Phase 2 routines...';

  -- TEST 1: Anon cannot call generate_branch_code
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.generate_branch_code($1, $2)' USING v_biz_id, 'test'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Anon was not denied generate_branch_code (error: %)', v_error_msg;
  END IF;

  -- TEST 2: Anon cannot call generate_staff_code
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.generate_staff_code($1, $2, $3)' USING v_biz_id, 'cashier'::text, 'test'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Anon was not denied generate_staff_code (error: %)', v_error_msg;
  END IF;

  -- TEST 3: Anon cannot call operations_staff_pin_status
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT * FROM public.operations_staff_pin_status($1)' USING v_biz_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Anon was not denied operations_staff_pin_status (error: %)', v_error_msg;
  END IF;

  -- TEST 4: Anon cannot call operations_upsert_branch
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.operations_upsert_branch($1, $2, $3, $4, $5)'
      USING v_biz_id, null::uuid, 'anon-loc'::text, 'فرع'::text, 'Branch'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Anon was not denied operations_upsert_branch (error: %)', v_error_msg;
  END IF;

  -- TEST 5: Anon cannot call operations_save_team_member
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.operations_save_team_member($1, $2, $3, $4, $5)'
      USING v_biz_id, null::uuid, 'anon-csh'::text, 'كاشير'::text, 'Cashier'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Anon was not denied operations_save_team_member (error: %)', v_error_msg;
  END IF;

  RAISE NOTICE '  PASS: All Phase 2 routines strictly denied to role "anon".';
END $$;

RESET ROLE;

-- ------------------------------------------------------------------------------
-- 3. AUTHENTICATED OWNER ROLE EXECUTION
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_id uuid := pg_temp.get_ctx('owner_id');
  v_biz_id uuid := pg_temp.get_ctx('biz_id');
  v_branch_a_id uuid := pg_temp.get_ctx('branch_a_id');
  v_branch_b_id uuid := pg_temp.get_ctx('branch_b_id');
  v_staff_csh_id uuid := pg_temp.get_ctx('staff_csh_id');
  v_staff_b_only_id uuid := pg_temp.get_ctx('staff_b_only_id');
  v_session_id uuid := pg_temp.get_ctx('session_id');

  v_new_branch_id uuid;
  v_new_branch_code text;
  v_new_staff_id uuid;
  v_new_staff_code text;
  v_pin_rows integer;
  v_pin_configured boolean;
  v_session_revoked_at timestamptz;
  v_session_revoked_by uuid;
  v_error_thrown boolean;
  v_error_msg text;
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'Test environment error: current_user is % instead of authenticated', current_user;
  END IF;

  PERFORM pg_temp.set_test_auth(v_owner_id);

  RAISE NOTICE '[OWNER TESTS] Verifying Owner operations and security protections...';

  -- TEST 6: Direct call to generate_branch_code denied even to authenticated owner
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.generate_branch_code($1, $2)' USING v_biz_id, 'direct-attempt'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Direct generate_branch_code must be denied to authenticated users (error: %)', v_error_msg;
  END IF;

  -- TEST 7: Direct call to generate_staff_code denied even to authenticated owner
  v_error_thrown := false;
  BEGIN
    EXECUTE 'SELECT public.generate_staff_code($1, $2, $3)' USING v_biz_id, 'cashier'::text, 'direct-attempt'::text;
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Direct generate_staff_code must be denied to authenticated users (error: %)', v_error_msg;
  END IF;

  -- TEST 8: Branch creation with null code auto-generates internal code atomically
  v_new_branch_id := public.operations_upsert_branch(
    _business_id := v_biz_id,
    _branch_id := null,
    _code := null,
    _name_ar := 'فرع الشاطئ',
    _name_en := 'Beach Branch'
  );
  SELECT code INTO v_new_branch_code FROM public.branches WHERE id = v_new_branch_id;
  IF v_new_branch_code IS NULL OR v_new_branch_code NOT LIKE 'beach-branch%' THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Expected auto-generated branch code like beach-branch%%, got %', v_new_branch_code;
  END IF;

  -- TEST 9: Team member creation with null code auto-generates internal staff code atomically
  v_new_staff_id := public.operations_save_team_member(
    _business_id := v_biz_id,
    _staff_id := null,
    _code := null,
    _name_ar := 'سارة المحاسبة',
    _name_en := 'Sara Cashier',
    _email := 'sara@test.local',
    _role := 'cashier',
    _status := 'active',
    _pin := '4321',
    _branch_ids := array[v_branch_a_id, v_branch_b_id]
  );
  SELECT code INTO v_new_staff_code FROM public.staff_members WHERE id = v_new_staff_id;
  IF v_new_staff_code IS NULL OR v_new_staff_code NOT LIKE 'csh-%' THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Expected auto-generated staff code like csh-%%, got %', v_new_staff_code;
  END IF;

  -- TEST 10: Owner operations_staff_pin_status returns correct configuration for all staff
  SELECT count(*) INTO v_pin_rows FROM public.operations_staff_pin_status(v_biz_id);
  IF v_pin_rows < 4 THEN
    RAISE EXCEPTION 'TEST 10a FAILED: Owner should see at least 4 staff members, got %', v_pin_rows;
  END IF;

  SELECT pin_configured INTO v_pin_configured
  FROM public.operations_staff_pin_status(v_biz_id)
  WHERE staff_id = v_staff_csh_id;
  IF v_pin_configured IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 10b FAILED: staff_csh_id should have pin_configured = true';
  END IF;

  SELECT pin_configured INTO v_pin_configured
  FROM public.operations_staff_pin_status(v_biz_id)
  WHERE staff_id = v_staff_b_only_id;
  IF v_pin_configured IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 10c FAILED: staff_b_only_id should have pin_configured = false';
  END IF;

  -- TEST 11: Removing branch assignment in operations_save_team_member revokes active cashier sessions
  -- Remove Branch A assignment, leaving only Branch B
  PERFORM public.operations_save_team_member(
    _business_id := v_biz_id,
    _staff_id := v_staff_csh_id,
    _code := 'csh-1',
    _name_ar := 'كاشير فرع أ',
    _name_en := 'Cashier Branch A',
    _email := 'cashier_p2@test.local',
    _role := 'cashier',
    _status := 'active',
    _pin := null,
    _branch_ids := array[v_branch_b_id]
  );

  SELECT revoked_at, revoked_by INTO v_session_revoked_at, v_session_revoked_by
  FROM public.cashier_sessions
  WHERE id = v_session_id;

  IF v_session_revoked_at IS NULL THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Cashier session was not revoked when branch assignment was removed!';
  END IF;
  IF v_session_revoked_by <> v_owner_id THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Expected revoked_by to be %, got %', v_owner_id, v_session_revoked_by;
  END IF;

  RAISE NOTICE '  PASS: Owner operations, auto-generation, PIN status, and session revocation verified.';
END $$;

-- ------------------------------------------------------------------------------
-- 4. AUTHENTICATED MANAGER ROLE EXECUTION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_manager_id uuid := pg_temp.get_ctx('manager_id');
  v_biz_id uuid := pg_temp.get_ctx('biz_id');
  v_branch_a_id uuid := pg_temp.get_ctx('branch_a_id');
  v_staff_b_only_id uuid := pg_temp.get_ctx('staff_b_only_id');

  v_count integer;
  v_error_thrown boolean;
  v_error_msg text;
BEGIN
  PERFORM pg_temp.set_test_auth(v_manager_id);

  RAISE NOTICE '[MANAGER TESTS] Verifying Manager scoping and permission boundaries...';

  -- TEST 12: Manager can call operations_staff_pin_status, but ONLY sees staff in managed branches
  SELECT count(*) INTO v_count
  FROM public.operations_staff_pin_status(v_biz_id)
  WHERE staff_id = v_staff_b_only_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Manager for Branch A saw PIN status for staff only in Branch B!';
  END IF;

  -- TEST 13: Manager cannot create a new branch
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_biz_id,
      _branch_id := null,
      _code := null,
      _name_ar := 'محاولة مدير',
      _name_en := 'Manager Attempt'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Branch creation denied%' THEN
    RAISE EXCEPTION 'TEST 13 FAILED: Manager was not denied branch creation (error: %)', v_error_msg;
  END IF;

  -- TEST 14: Manager cannot create or update staff members via operations_save_team_member
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_save_team_member(
      _business_id := v_biz_id,
      _staff_id := null,
      _code := null,
      _name_ar := 'كاشير غير مصرح',
      _name_en := 'Unauthorized Cashier',
      _email := null,
      _role := 'cashier',
      _branch_ids := array[v_branch_a_id]
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Staff management denied%' THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Manager was not denied team member creation (error: %)', v_error_msg;
  END IF;

  RAISE NOTICE '  PASS: Manager access properly scoped to managed branch with zero escalation.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. AUTHENTICATED CASHIER ROLE EXECUTION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_cashier_id uuid := pg_temp.get_ctx('cashier_id');
  v_biz_id uuid := pg_temp.get_ctx('biz_id');
  v_error_thrown boolean;
  v_error_msg text;
BEGIN
  PERFORM pg_temp.set_test_auth(v_cashier_id);

  RAISE NOTICE '[CASHIER TESTS] Verifying Cashier role cannot access administrative operations...';

  -- TEST 15: Cashier is denied operations_staff_pin_status
  v_error_thrown := false;
  BEGIN
    PERFORM * FROM public.operations_staff_pin_status(v_biz_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Access denied to business staff PIN status%' THEN
    RAISE EXCEPTION 'TEST 15 FAILED: Cashier was not denied operations_staff_pin_status (error: %)', v_error_msg;
  END IF;

  -- TEST 16: Cashier is denied operations_upsert_branch
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_biz_id,
      _branch_id := null,
      _code := null,
      _name_ar := 'فرع كاشير',
      _name_en := 'Cashier Branch'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Branch creation denied%' THEN
    RAISE EXCEPTION 'TEST 16 FAILED: Cashier was not denied branch creation (error: %)', v_error_msg;
  END IF;

  -- TEST 17: Cashier is denied operations_save_team_member
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_save_team_member(
      _business_id := v_biz_id,
      _staff_id := null,
      _code := null,
      _name_ar := 'موظف كاشير',
      _name_en := 'Cashier Staff'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Staff management denied%' THEN
    RAISE EXCEPTION 'TEST 17 FAILED: Cashier was not denied operations_save_team_member (error: %)', v_error_msg;
  END IF;

  RAISE NOTICE '  PASS: Cashier role strictly prevented from accessing admin/PIN operations.';
END $$;

-- ------------------------------------------------------------------------------
-- 6. AUTHENTICATED CROSS-TENANT ISOLATION EXECUTION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_cross_user_id uuid := pg_temp.get_ctx('cross_user_id');
  v_biz_id uuid := pg_temp.get_ctx('biz_id');
  v_error_thrown boolean;
  v_error_msg text;
BEGIN
  PERFORM pg_temp.set_test_auth(v_cross_user_id);

  RAISE NOTICE '[CROSS-TENANT TESTS] Verifying cross-business tenant isolation...';

  -- TEST 18: Cross-business caller denied operations_staff_pin_status
  v_error_thrown := false;
  BEGIN
    PERFORM * FROM public.operations_staff_pin_status(v_biz_id);
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_msg := SQLERRM;
  END;
  IF NOT v_error_thrown OR v_error_msg NOT LIKE '%Access denied to business staff PIN status%' THEN
    RAISE EXCEPTION 'TEST 18 FAILED: Cross-tenant caller was not denied operations_staff_pin_status (error: %)', v_error_msg;
  END IF;

  RAISE NOTICE '  PASS: Cross-tenant isolation fully verified.';
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'ALL PHASE 2 HARDENING TESTS PASSED SUCCESSFULLY!';
  RAISE NOTICE '==============================================================';
END $$;

RESET ROLE;

ROLLBACK;

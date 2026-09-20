-- ==============================================================================
-- PointPass Phase 1: Role + Location Foundation Executable Certification Suite
-- Genuine RLS Execution under PostgreSQL role "authenticated".
-- Executes inside a transaction with automatic ROLLBACK so zero test data remains.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Temporary Fixtures & Context Registry (Privileged Execution as Session User)
-- ------------------------------------------------------------------------------
CREATE TEMP TABLE pg_temp.test_context (
  key text PRIMARY KEY,
  val uuid NOT NULL
);
GRANT ALL ON pg_temp.test_context TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.get_ctx(p_key text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT val FROM pg_temp.test_context WHERE key = p_key;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.get_ctx(text) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.set_test_auth(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.set_test_auth(uuid) TO authenticated;

-- Force RLS on tested relations as defense-in-depth
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_branch_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pass_transactions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_owner_user_id uuid := gen_random_uuid();
  v_other_owner_id uuid := gen_random_uuid();
  v_manager_user_id uuid := gen_random_uuid();
  v_cashier_user_id uuid := gen_random_uuid();
  v_legacy_admin_user_id uuid := gen_random_uuid();

  v_single_biz_id uuid;
  v_multi_biz_id uuid;
  v_other_biz_id uuid;

  v_single_main_branch_id uuid;
  v_multi_branch_a_id uuid;
  v_multi_branch_b_id uuid;
  v_other_branch_id uuid;

  v_staff_mgr_id uuid;
  v_staff_csh_id uuid;
  v_staff_other_branch_id uuid;
  v_staff_legacy_admin_id uuid;

  v_session_a_id uuid;
  v_session_b_id uuid;
  v_session_unattributed_id uuid;

  v_tx_a_id uuid;
  v_tx_b_id uuid;
  v_tx_unattributed_id uuid;

  v_count integer;
  v_limit integer;
  v_name_ar text;
  v_name_en text;
  v_status text;
  v_role text;
  v_error_thrown boolean;
  v_error_message text;
BEGIN
  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'Starting PointPass Phase 1 Real Database Certification Suite';
  RAISE NOTICE 'Phase: Privileged Setup and Database Constraints Engine';
  RAISE NOTICE 'Current User: % | Session User: %', current_user, session_user;
  RAISE NOTICE '==============================================================';

  -- A. Create Mock auth.users records for referential integrity
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_owner_user_id, 'owner@test.local', '{}'::jsonb),
    (v_other_owner_id, 'other_owner@test.local', '{}'::jsonb),
    (v_manager_user_id, 'manager_a@test.local', '{}'::jsonb),
    (v_cashier_user_id, 'cashier_a@test.local', '{}'::jsonb),
    (v_legacy_admin_user_id, 'legacy_admin@test.local', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- B. TEST 1: Automatic Main Location Creation
  RAISE NOTICE '[TEST 1] Verifying automatic main branch creation on new business...';
  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_owner_user_id, 'single-bakery-' || substr(gen_random_uuid()::text, 1, 8),
    'مخبز الفرع الواحد', 'Single Bakery', 'single_location', 'active'
  ) RETURNING id INTO v_single_biz_id;

  SELECT id, code, name_ar, name_en, status
  INTO v_single_main_branch_id, v_role, v_name_ar, v_name_en, v_status
  FROM public.branches
  WHERE business_id = v_single_biz_id AND lower(code) = 'main';

  IF v_single_main_branch_id IS NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch was not automatically created';
  END IF;

  IF v_name_ar <> 'الفرع الرئيسي' OR v_name_en <> 'Main Location' OR v_status <> 'active' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch defaults incorrect: ar=%, en=%, status=%',
      v_name_ar, v_name_en, v_status;
  END IF;

  -- Idempotency check: duplicate insert ignored on conflict
  INSERT INTO public.branches (
    business_id, code, name_ar, name_en, status
  ) VALUES (
    v_single_biz_id, 'main', 'الفرع الرئيسي', 'Main Location', 'active'
  ) ON CONFLICT (business_id, lower(code)) DO NOTHING;

  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE business_id = v_single_biz_id AND lower(code) = 'main';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Main branch was duplicated on conflict';
  END IF;
  RAISE NOTICE '  PASS: Automatic main location created with correct defaults and idempotency.';

  -- C. TEST 2: Single-Location Limit Enforcement (max = 1)
  RAISE NOTICE '[TEST 2] Verifying single_location business cannot exceed 1 branch...';
  SELECT max_locations INTO v_limit
  FROM public.business_location_entitlement(v_single_biz_id);

  IF v_limit <> 1 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected entitlement max_locations = 1, got %', v_limit;
  END IF;

  v_error_thrown := false;
  BEGIN
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_single_biz_id, 'second-branch', 'فرع ثاني', 'Second Branch', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Location limit exceeded%' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Single-location business inserted a 2nd branch (error: %)', v_error_message;
  END IF;

  -- Deactivating main branch allows replacement active branch
  UPDATE public.branches SET status = 'inactive' WHERE id = v_single_main_branch_id;
  INSERT INTO public.branches (
    business_id, code, name_ar, name_en, status
  ) VALUES (
    v_single_biz_id, 'replacement-branch', 'فرع بديل', 'Replacement Branch', 'active'
  );
  DELETE FROM public.branches WHERE business_id = v_single_biz_id AND code = 'replacement-branch';
  UPDATE public.branches SET status = 'active' WHERE id = v_single_main_branch_id;
  RAISE NOTICE '  PASS: Single-location limit strictly enforced; inactive branches do not block replacement.';

  -- D. TEST 3: Multi-Location Limit Enforcement (limit = 10)
  RAISE NOTICE '[TEST 3] Verifying multi_location business limit (limit = 10)...';
  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_owner_user_id, 'multi-roastery-' || substr(gen_random_uuid()::text, 1, 8),
    'محمصة الفروع المتعددة', 'Multi Branch Roastery', 'multi_location', 'active'
  ) RETURNING id INTO v_multi_biz_id;

  SELECT id INTO v_multi_branch_a_id
  FROM public.branches
  WHERE business_id = v_multi_biz_id AND lower(code) = 'main';

  SELECT max_locations INTO v_limit
  FROM public.business_location_entitlement(v_multi_biz_id);

  IF v_limit <> 10 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected entitlement max_locations = 10, got %', v_limit;
  END IF;

  -- Insert branches 2..10
  FOR i IN 2..10 LOOP
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_multi_biz_id, 'branch-' || i, 'فرع ' || i, 'Branch ' || i, 'active'
    ) RETURNING id INTO v_multi_branch_b_id;
  END LOOP;

  SELECT count(*) INTO v_count
  FROM public.branches
  WHERE business_id = v_multi_biz_id AND status = 'active';

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Expected 10 active branches, found %', v_count;
  END IF;

  -- 11th branch insert must fail
  v_error_thrown := false;
  BEGIN
    INSERT INTO public.branches (
      business_id, code, name_ar, name_en, status
    ) VALUES (
      v_multi_biz_id, 'branch-11', 'فرع 11', 'Branch 11', 'active'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Location limit exceeded%' THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Multi-location business inserted an 11th branch (error: %)', v_error_message;
  END IF;
  RAISE NOTICE '  PASS: Multi-location limit (10) strictly enforced at DB level.';

  -- E. Setup Other Competitor Business
  INSERT INTO public.businesses (
    id, owner_id, slug, name_ar, name_en, plan, status
  ) VALUES (
    gen_random_uuid(), v_other_owner_id, 'other-biz-' || substr(gen_random_uuid()::text, 1, 8),
    'متجر منافس', 'Competitor Store', 'single_location', 'active'
  ) RETURNING id INTO v_other_biz_id;

  SELECT id INTO v_other_branch_id
  FROM public.branches
  WHERE business_id = v_other_biz_id AND lower(code) = 'main';

  -- F. TEST 4: Backend Staff Role Restrictions in operations_upsert_staff
  RAISE NOTICE '[TEST 4] Verifying authoritative backend restriction on new staff roles...';
  PERFORM pg_temp.set_test_auth(v_owner_user_id);

  -- Fresh staff with role 'admin' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'bad-admin',
      _name_ar := 'مشرف جديد',
      _name_en := 'New Admin',
      _email := 'badadmin@test.local',
      _role := 'admin'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%New staff members can only be created with manager or cashier roles%' THEN
    RAISE EXCEPTION 'TEST 4a FAILED: Allowed creation of new staff with admin role (error: %)', v_error_message;
  END IF;

  -- Fresh staff with role 'staff' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'bad-staff',
      _name_ar := 'موظف عام',
      _name_en := 'Generic Staff',
      _email := 'badstaff@test.local',
      _role := 'staff'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%New staff members can only be created with manager or cashier roles%' THEN
    RAISE EXCEPTION 'TEST 4b FAILED: Allowed creation of new staff with generic staff role (error: %)', v_error_message;
  END IF;

  -- Fresh staff with role 'manager' succeeds
  v_staff_mgr_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'mgr-a',
    _name_ar := 'مدير فرع أ',
    _name_en := 'Manager Branch A',
    _email := 'manager_a@test.local',
    _role := 'manager'
  );

  -- Fresh staff with role 'cashier' succeeds
  v_staff_csh_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'csh-a',
    _name_ar := 'كاشير فرع أ',
    _name_en := 'Cashier Branch A',
    _email := 'cashier_a@test.local',
    _role := 'cashier',
    _pin := '1234'
  );

  -- Cashier for Branch B
  v_staff_other_branch_id := public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := NULL,
    _code := 'csh-b',
    _name_ar := 'كاشير فرع ب',
    _name_en := 'Cashier Branch B',
    _email := 'cashier_b@test.local',
    _role := 'cashier',
    _pin := '5678'
  );

  -- Legacy Staff record insertion via seed
  INSERT INTO public.staff_members (
    business_id, auth_user_id, code, name_ar, name_en, email, role, status
  ) VALUES (
    v_multi_biz_id, v_legacy_admin_user_id, 'legacy-adm', 'مشرف قديم', 'Legacy Admin',
    'legacy_admin@test.local', 'admin', 'active'
  ) RETURNING id INTO v_staff_legacy_admin_id;

  -- Safe edit of existing legacy admin (preserving role) succeeds
  PERFORM public.operations_upsert_staff(
    _business_id := v_multi_biz_id,
    _staff_id := v_staff_legacy_admin_id,
    _code := 'legacy-adm',
    _name_ar := 'مشرف قديم معدل',
    _name_en := 'Updated Legacy Admin',
    _email := 'legacy_admin@test.local',
    _role := 'admin'
  );

  -- Transitioning manager to 'admin' must fail
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := v_staff_mgr_id,
      _code := 'mgr-a',
      _name_ar := 'مدير فرع أ',
      _name_en := 'Manager Branch A',
      _email := 'manager_a@test.local',
      _role := 'admin'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Role can only be transitioned to manager or cashier%' THEN
    RAISE EXCEPTION 'TEST 4e FAILED: Allowed transition of manager to admin (error: %)', v_error_message;
  END IF;
  RAISE NOTICE '  PASS: Authoritative backend role restrictions validated.';

  -- G. Setup Branch Assignments, Cashier Sessions, and Transactions
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_mgr_id, v_multi_branch_a_id, true);
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_csh_id, v_multi_branch_a_id, true);
  PERFORM public.operations_assign_staff(v_multi_biz_id, v_staff_other_branch_id, v_multi_branch_b_id, true);

  -- Sessions
  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, v_multi_branch_a_id, v_staff_csh_id, 'hash-token-a', 'Terminal A', now() + interval '1 hour'
  ) RETURNING id INTO v_session_a_id;

  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, v_multi_branch_b_id, v_staff_other_branch_id, 'hash-token-b', 'Terminal B', now() + interval '1 hour'
  ) RETURNING id INTO v_session_b_id;

  INSERT INTO public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) VALUES (
    v_multi_biz_id, NULL, NULL, 'hash-token-legacy', 'Legacy Device', now() + interval '1 hour'
  ) RETURNING id INTO v_session_unattributed_id;

  -- Transactions
  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-001', v_multi_biz_id, v_multi_branch_a_id, v_staff_csh_id, 'stamp', NULL
  ) RETURNING id INTO v_tx_a_id;

  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-002', v_multi_biz_id, v_multi_branch_b_id, v_staff_other_branch_id, 'stamp', NULL
  ) RETURNING id INTO v_tx_b_id;

  INSERT INTO public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, amount_sar
  ) VALUES (
    'PASS-003', v_multi_biz_id, NULL, NULL, 'points', 50
  ) RETURNING id INTO v_tx_unattributed_id;

  -- Save Fixture Context for RLS test blocks
  INSERT INTO pg_temp.test_context (key, val) VALUES
    ('owner_id', v_owner_user_id),
    ('other_owner_id', v_other_owner_id),
    ('manager_id', v_manager_user_id),
    ('cashier_id', v_cashier_user_id),
    ('legacy_admin_id', v_legacy_admin_user_id),
    ('single_biz_id', v_single_biz_id),
    ('multi_biz_id', v_multi_biz_id),
    ('other_biz_id', v_other_biz_id),
    ('branch_a_id', v_multi_branch_a_id),
    ('branch_b_id', v_multi_branch_b_id),
    ('other_branch_id', v_other_branch_id),
    ('staff_mgr_id', v_staff_mgr_id),
    ('staff_csh_id', v_staff_csh_id),
    ('staff_other_branch_id', v_staff_other_branch_id),
    ('session_a_id', v_session_a_id),
    ('session_b_id', v_session_b_id),
    ('session_unattributed_id', v_session_unattributed_id),
    ('tx_a_id', v_tx_a_id),
    ('tx_b_id', v_tx_b_id),
    ('tx_unattributed_id', v_tx_unattributed_id);

  RAISE NOTICE 'Privileged fixtures created. Transitioning to genuine "authenticated" RLS role execution...';
END $$;

-- ------------------------------------------------------------------------------
-- 2. MANAGER ISOLATION: Genuine RLS Execution as role "authenticated"
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_manager_id uuid := pg_temp.get_ctx('manager_id');
  v_multi_biz_id uuid := pg_temp.get_ctx('multi_biz_id');
  v_branch_a_id uuid := pg_temp.get_ctx('branch_a_id');
  v_branch_b_id uuid := pg_temp.get_ctx('branch_b_id');
  v_staff_mgr_id uuid := pg_temp.get_ctx('staff_mgr_id');
  v_staff_csh_id uuid := pg_temp.get_ctx('staff_csh_id');
  v_staff_other_branch_id uuid := pg_temp.get_ctx('staff_other_branch_id');
  v_session_a_id uuid := pg_temp.get_ctx('session_a_id');
  v_session_b_id uuid := pg_temp.get_ctx('session_b_id');
  v_session_unattributed_id uuid := pg_temp.get_ctx('session_unattributed_id');
  v_tx_a_id uuid := pg_temp.get_ctx('tx_a_id');
  v_tx_b_id uuid := pg_temp.get_ctx('tx_b_id');
  v_tx_unattributed_id uuid := pg_temp.get_ctx('tx_unattributed_id');

  v_count integer;
  v_analytics jsonb;
  v_error_thrown boolean;
  v_error_message text;
BEGIN
  -- Prove current_user is genuinely 'authenticated'
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'RLS Test environment error: current_user is % instead of authenticated', current_user;
  END IF;

  PERFORM pg_temp.set_test_auth(v_manager_id);

  IF auth.uid() <> v_manager_id THEN
    RAISE EXCEPTION 'RLS Test environment error: auth.uid() is % instead of manager_id %', auth.uid(), v_manager_id;
  END IF;

  RAISE NOTICE '[TEST 5] Testing RLS queries under Manager context (role: %, auth.uid: %)...',
    current_user, auth.uid();

  -- 5a. Branch Read Isolation
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_multi_biz_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5a FAILED: Manager saw % branches, expected exactly 1 (assigned Branch A)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.branches WHERE id = v_branch_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5a FAILED: Manager was able to select unassigned Branch B!';
  END IF;

  -- 5b. Staff Read Isolation
  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_mgr_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager cannot read their own staff record';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_csh_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager cannot read co-worker in assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_members WHERE id = v_staff_other_branch_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5b FAILED: Manager was able to select staff from unassigned Branch B!';
  END IF;

  -- 5c. Staff Branch Assignments Read Isolation
  SELECT count(*) INTO v_count FROM public.staff_branch_assignments WHERE branch_id = v_branch_a_id;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'TEST 5c FAILED: Manager cannot read assignments for assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.staff_branch_assignments WHERE branch_id = v_branch_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5c FAILED: Manager was able to select assignments for unassigned Branch B!';
  END IF;

  -- 5d. Cashier Sessions Read Isolation
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager cannot read cashier session for assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager was able to select cashier session for unassigned Branch B!';
  END IF;

  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE id = v_session_unattributed_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5d FAILED: Manager was able to select unattributed cashier session!';
  END IF;

  -- 5e. Transactions Read Isolation
  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager cannot read transaction for assigned Branch A';
  END IF;

  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager was able to select transaction for unassigned Branch B!';
  END IF;

  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE id = v_tx_unattributed_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5e FAILED: Manager was able to select unattributed transaction!';
  END IF;
  RAISE NOTICE '  PASS: Manager read isolation verified under PostgreSQL "authenticated" role (zero recursion).';

  -- 5f. Manager Mutation Isolation
  RAISE NOTICE '[TEST 6] Testing Manager mutation isolation via RPC under authenticated role...';
  -- Mutating assigned Branch A succeeds
  PERFORM public.operations_upsert_branch(
    _business_id := v_multi_biz_id,
    _branch_id := v_branch_a_id,
    _code := 'main',
    _name_ar := 'الفرع الرئيسي المحدث',
    _name_en := 'Updated Main Branch'
  );

  -- Mutating unassigned Branch B fails
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := v_branch_b_id,
      _code := 'branch-b-hacked',
      _name_ar := 'فرع مخترق',
      _name_en := 'Hacked Branch'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Branch update denied%' THEN
    RAISE EXCEPTION 'TEST 6b FAILED: Manager updated unassigned branch under authenticated role (error: %)', v_error_message;
  END IF;

  -- Creating new branch fails
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := NULL,
      _code := 'manager-new-branch',
      _name_ar := 'فرع جديد',
      _name_en := 'New Branch'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Branch creation denied%' THEN
    RAISE EXCEPTION 'TEST 6c FAILED: Manager created new branch under authenticated role (error: %)', v_error_message;
  END IF;
  RAISE NOTICE '  PASS: Manager mutation restrictions verified under PostgreSQL "authenticated" role.';

  -- 5g. Manager Analytics Scoping
  RAISE NOTICE '[TEST 9] Testing Manager analytics scoping under authenticated role...';
  v_analytics := public.business_analytics(
    _business_id := v_multi_biz_id,
    _date_from := current_date - 1,
    _date_to := current_date + 1
  );

  IF (v_analytics->'summary'->>'totalTransactions')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST 9a FAILED: Manager analytics totalTransactions should be 1 (Branch A only), got %',
      v_analytics->'summary'->>'totalTransactions';
  END IF;

  IF jsonb_path_exists(v_analytics, '$.filters.branches[*] ? (@.id == $id)', jsonb_build_object('id', v_branch_b_id)) THEN
    RAISE EXCEPTION 'TEST 9a FAILED: Unassigned Branch B leaked into Manager analytics filter list!';
  END IF;

  v_error_thrown := false;
  BEGIN
    PERFORM public.business_analytics(
      _business_id := v_multi_biz_id,
      _date_from := current_date - 1,
      _date_to := current_date + 1,
      _branch_id := v_branch_b_id
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
    v_error_message := SQLERRM;
  END;

  IF NOT v_error_thrown OR v_error_message NOT LIKE '%Analytics access denied%' THEN
    RAISE EXCEPTION 'TEST 9b FAILED: Manager requested analytics for unassigned Branch B! (error: %)', v_error_message;
  END IF;
  RAISE NOTICE '  PASS: Manager analytics scoping verified under PostgreSQL "authenticated" role.';
END $$;

RESET ROLE;

-- ------------------------------------------------------------------------------
-- 3. CASHIER RESTRICTIONS: Genuine RLS Execution as role "authenticated"
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_cashier_id uuid := pg_temp.get_ctx('cashier_id');
  v_multi_biz_id uuid := pg_temp.get_ctx('multi_biz_id');
  v_branch_a_id uuid := pg_temp.get_ctx('branch_a_id');

  v_count integer;
  v_role text;
  v_can_manage boolean;
  v_can_manage_biz boolean;
  v_error_thrown boolean;
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'RLS Test environment error: current_user is % instead of authenticated', current_user;
  END IF;

  PERFORM pg_temp.set_test_auth(v_cashier_id);
  RAISE NOTICE '[TEST 7] Testing Cashier restrictions under authenticated role (auth.uid: %)...', auth.uid();

  -- Cashier cannot read cashier_sessions table directly
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE business_id = v_multi_biz_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7a FAILED: Cashier read % rows from cashier_sessions table!', v_count;
  END IF;

  -- Cashier cannot mutate branch
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_multi_biz_id,
      _branch_id := v_branch_a_id,
      _code := 'main',
      _name_ar := 'كاشير يحاول التعديل',
      _name_en := 'Cashier Attempt'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 7b FAILED: Cashier was able to mutate branch!';
  END IF;

  -- Cashier cannot manage staff
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_staff(
      _business_id := v_multi_biz_id,
      _staff_id := NULL,
      _code := 'csh-rogue',
      _name_ar := 'موظف غير مصرح',
      _name_en := 'Rogue Staff',
      _email := 'rogue@test.local',
      _role := 'cashier'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 7c FAILED: Cashier was able to call operations_upsert_staff!';
  END IF;

  -- operations_access returns role cashier, can_manage false
  SELECT operational_role, can_manage, can_manage_business
  INTO v_role, v_can_manage, v_can_manage_biz
  FROM public.operations_access(v_multi_biz_id);

  IF v_role <> 'cashier' OR v_can_manage OR v_can_manage_biz THEN
    RAISE EXCEPTION 'TEST 7d FAILED: Cashier operations_access returned invalid permissions (role: %, can_manage: %)',
      v_role, v_can_manage;
  END IF;
  RAISE NOTICE '  PASS: Cashier restrictions verified under PostgreSQL "authenticated" role.';
END $$;

RESET ROLE;

-- ------------------------------------------------------------------------------
-- 4. OWNER VISIBILITY & CROSS-TENANT ISOLATION: Role "authenticated"
-- ------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_owner_id uuid := pg_temp.get_ctx('owner_id');
  v_multi_biz_id uuid := pg_temp.get_ctx('multi_biz_id');
  v_other_biz_id uuid := pg_temp.get_ctx('other_biz_id');
  v_other_branch_id uuid := pg_temp.get_ctx('other_branch_id');

  v_count integer;
  v_analytics jsonb;
  v_error_thrown boolean;
BEGIN
  IF current_user <> 'authenticated' THEN
    RAISE EXCEPTION 'RLS Test environment error: current_user is % instead of authenticated', current_user;
  END IF;

  PERFORM pg_temp.set_test_auth(v_owner_id);
  RAISE NOTICE '[TEST 8] Testing Owner visibility and cross-tenant isolation (auth.uid: %)...', auth.uid();

  -- Owner reads all 10 branches in their business
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_multi_biz_id;
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'TEST 8a FAILED: Owner saw % branches, expected 10', v_count;
  END IF;

  -- Owner reads all 3 sessions (including legacy unattributed)
  SELECT count(*) INTO v_count FROM public.cashier_sessions WHERE business_id = v_multi_biz_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 8b FAILED: Owner saw % sessions, expected 3', v_count;
  END IF;

  -- Owner reads all 3 transactions (including legacy unattributed)
  SELECT count(*) INTO v_count FROM public.pass_transactions WHERE business_id = v_multi_biz_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'TEST 8c FAILED: Owner saw % transactions, expected 3', v_count;
  END IF;

  -- Cross-tenant isolation: Owner reads 0 branches from competitor
  SELECT count(*) INTO v_count FROM public.branches WHERE business_id = v_other_biz_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 8d FAILED: Owner was able to view competitor branches!';
  END IF;

  -- Cross-tenant mutation denied
  v_error_thrown := false;
  BEGIN
    PERFORM public.operations_upsert_branch(
      _business_id := v_other_biz_id,
      _branch_id := v_other_branch_id,
      _code := 'main',
      _name_ar := 'محاولة تعديل منافس',
      _name_en := 'Competitor Mutate Attempt'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_thrown := true;
  END;

  IF NOT v_error_thrown THEN
    RAISE EXCEPTION 'TEST 8e FAILED: Owner was able to mutate competitor branch!';
  END IF;

  -- Owner Analytics sees all transactions (Branch A + Branch B + unattributed = 3)
  v_analytics := public.business_analytics(
    _business_id := v_multi_biz_id,
    _date_from := current_date - 1,
    _date_to := current_date + 1
  );

  IF (v_analytics->'summary'->>'totalTransactions')::integer <> 3 THEN
    RAISE EXCEPTION 'TEST 8f FAILED: Owner analytics should see 3 transactions, got %',
      v_analytics->'summary'->>'totalTransactions';
  END IF;
  RAISE NOTICE '  PASS: Owner full visibility and cross-tenant isolation verified under "authenticated" role.';

  RAISE NOTICE '==============================================================';
  RAISE NOTICE 'ALL PHASE 1 CERTIFICATION TESTS PASSED SUCCESSFULLY!';
  RAISE NOTICE 'All tests executed under authenticated RLS role with zero errors.';
  RAISE NOTICE '==============================================================';
END $$;

RESET ROLE;

ROLLBACK;

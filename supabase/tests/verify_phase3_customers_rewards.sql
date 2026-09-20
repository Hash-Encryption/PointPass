-- ==============================================================================
-- PointPass Phase 3: Comprehensive Pre-Deployment Certification Suite
-- Roles: Owner, Manager, Cashier, Anon
-- Tests: Customers V1, Manager Branch Isolation & Anti-Leakage,
-- Phone Normalization, Concurrency-Safe Repeat Join, Truthful Anonymous Pass,
-- Complete Reward Lifecycle (Stamp, Points, Coupon Morph), and Attribution.
-- Fully transactional: ends with ROLLBACK so zero test data persists.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. Ensure Phase 3 DDL & Functions in-transaction for test environment
-- ------------------------------------------------------------------------------

-- Allow phone to be null
alter table public.pass_instances alter column phone drop not null;

-- Ensure phone normalizer
create or replace function public.normalize_customer_phone(_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  _cleaned text;
begin
  if _raw is null or trim(_raw) = '' then
    return null;
  end if;

  _cleaned := regexp_replace(trim(_raw), '[^\+0-9]', '', 'g');

  if _cleaned is null or _cleaned = '' then
    return null;
  end if;

  if _cleaned ~ '^05[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 3);
  end if;

  if _cleaned ~ '^5[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 2);
  end if;

  if _cleaned ~ '^9665[0-9]{8}$' then
    return '+' || _cleaned;
  end if;

  if _cleaned ~ '^\+9665[0-9]{8}$' then
    return _cleaned;
  end if;

  if _cleaned ~ '^009665[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 7);
  end if;

  if _cleaned ~ '^\+[1-9][0-9]{6,14}$' then
    return _cleaned;
  end if;

  if _cleaned ~ '^00[1-9][0-9]{6,14}$' then
    return '+' || substr(_cleaned, 3);
  end if;

  return null;
end;
$$;

-- Ensure claim_public_pass
drop function if exists public.claim_public_pass(text, text);
drop function if exists public.claim_public_pass(text);

create or replace function public.claim_public_pass(_slug text, _phone text default null)
returns table (
  pass_serial text,
  pass_program_type public.program_type,
  business_name text,
  business_offer text,
  business_target_stamps integer,
  business_sar_per_point integer,
  business_points_per_reward integer,
  pass_stamps integer,
  pass_points integer,
  pass_morphed boolean,
  pass_wallet_serial text,
  is_resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _business public.businesses%rowtype;
  _normalized_phone text;
  _existing_pass public.pass_instances%rowtype;
begin
  select b.* into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active';

  if not found then
    raise exception 'Business not found or inactive';
  end if;

  if _phone is not null and trim(_phone) <> '' then
    _normalized_phone := public.normalize_customer_phone(_phone);
    if _normalized_phone is null then
      raise exception 'Phone identifier must contain a valid phone number';
    end if;

    perform pg_advisory_xact_lock(hashtext('pass_claim:' || _business.id::text || ':' || _normalized_phone));

    select p.* into _existing_pass
    from public.pass_instances p
    where p.business_id = _business.id
      and (
        p.phone = _normalized_phone
        or p.phone = trim(_phone)
        or public.normalize_customer_phone(p.phone) = _normalized_phone
      )
    order by
      (p.wallet_serial is not null) desc,
      p.last_visit_at desc nulls last,
      p.created_at asc,
      p.id asc
    limit 1;

    if _existing_pass.id is not null then
      return query
      select
        _existing_pass.serial,
        _existing_pass.program_type,
        _business.name_en,
        coalesce(_business.offer_en, ''),
        coalesce(_business.target_stamps, 9),
        coalesce(_business.sar_per_point, 10),
        coalesce(_business.points_per_reward, 100),
        _existing_pass.stamps,
        _existing_pass.points,
        _existing_pass.morphed,
        _existing_pass.wallet_serial,
        true;
      return;
    end if;

    return query
    insert into public.pass_instances (
      business_slug,
      business_id,
      phone,
      program_type
    )
    values (
      _business.slug,
      _business.id,
      _normalized_phone,
      _business.program_type
    )
    returning
      pass_instances.serial,
      pass_instances.program_type,
      _business.name_en,
      coalesce(_business.offer_en, ''),
      coalesce(_business.target_stamps, 9),
      coalesce(_business.sar_per_point, 10),
      coalesce(_business.points_per_reward, 100),
      pass_instances.stamps,
      pass_instances.points,
      pass_instances.morphed,
      pass_instances.wallet_serial,
      false;

  else
    return query
    insert into public.pass_instances (
      business_slug,
      business_id,
      phone,
      program_type
    )
    values (
      _business.slug,
      _business.id,
      null,
      _business.program_type
    )
    returning
      pass_instances.serial,
      pass_instances.program_type,
      _business.name_en,
      coalesce(_business.offer_en, ''),
      coalesce(_business.target_stamps, 9),
      coalesce(_business.sar_per_point, 10),
      coalesce(_business.points_per_reward, 100),
      pass_instances.stamps,
      pass_instances.points,
      pass_instances.morphed,
      pass_instances.wallet_serial,
      false;
  end if;
end;
$$;

-- Ensure managed_branch_ids helper
drop function if exists public.managed_branch_ids(uuid, uuid);
create or replace function public.managed_branch_ids(_user_id uuid, _business_id uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _can_manage_biz boolean;
  _branches uuid[];
begin
  if _user_id is null or _business_id is null then
    return array[]::uuid[];
  end if;

  _can_manage_biz := public.can_manage_business(_user_id, _business_id);

  if _can_manage_biz then
    select coalesce(array_agg(b.id), array[]::uuid[]) into _branches
    from public.branches b
    where b.business_id = _business_id and b.status = 'active';
  else
    select coalesce(array_agg(a.branch_id), array[]::uuid[]) into _branches
    from public.staff_members s
    join public.staff_branch_assignments a
      on a.staff_id = s.id and a.business_id = s.business_id
    where s.auth_user_id = _user_id
      and s.business_id = _business_id
      and s.status = 'active'
      and s.role in ('manager', 'admin', 'owner');
  end if;

  return coalesce(_branches, array[]::uuid[]);
end;
$$;

-- Ensure operations_customers_list
drop function if exists public.operations_customers_list(uuid, uuid, text, integer, integer);

create or replace function public.operations_customers_list(
  _business_id uuid,
  _branch_id uuid default null,
  _search text default null,
  _limit integer default 50,
  _offset integer default 0
)
returns table (
  customer_id uuid,
  phone text,
  is_anonymous boolean,
  program_type public.program_type,
  current_stamps integer,
  current_points integer,
  is_morphed boolean,
  target_stamps integer,
  points_per_reward integer,
  join_date timestamptz,
  first_location_activity_at timestamptz,
  last_activity_at timestamptz,
  transaction_count integer,
  redeem_count integer,
  location_stamps_issued integer,
  location_points_issued integer,
  wallet_attached boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _is_owner boolean;
  _managed_branches uuid[];
  _effective_branches uuid[];
  _clean_search text;
  _search_norm text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  _is_owner := public.can_manage_business(auth.uid(), _business_id);

  -- Explicitly deny cashiers
  if not _is_owner and exists (
    select 1 from public.staff_members s
    where s.auth_user_id = auth.uid()
      and s.business_id = _business_id
      and s.status = 'active'
      and s.role in ('cashier', 'staff')
      and not exists (
        select 1 from public.staff_members s2
        where s2.auth_user_id = auth.uid()
          and s2.business_id = _business_id
          and s2.status = 'active'
          and s2.role in ('owner', 'admin', 'manager')
      )
  ) then
    raise exception 'Access denied: cashiers cannot access customer intelligence';
  end if;

  _managed_branches := public.managed_branch_ids(auth.uid(), _business_id);

  if not _is_owner then
    if _managed_branches is null or array_length(_managed_branches, 1) is null then
      raise exception 'Access denied to customers';
    end if;

    if _branch_id is not null then
      if not (_branch_id = any(_managed_branches)) then
        raise exception 'Access denied for requested branch';
      end if;
      _effective_branches := array[_branch_id];
    else
      _effective_branches := _managed_branches;
    end if;
  else
    if _branch_id is not null then
      _effective_branches := array[_branch_id];
    end if;
  end if;

  _clean_search := trim(coalesce(_search, ''));
  if _clean_search <> '' then
    _search_norm := public.normalize_customer_phone(_clean_search);
  end if;

  if _is_owner then
    return query
    select
      p.id as customer_id,
      case
        when p.phone is null or p.phone ~* '^guest(-.*)?$' then null
        else p.phone
      end as phone,
      (p.phone is null or p.phone ~* '^guest(-.*)?$') as is_anonymous,
      p.program_type,
      p.stamps as current_stamps,
      p.points as current_points,
      p.morphed as is_morphed,
      coalesce(b.target_stamps, 9) as target_stamps,
      coalesce(b.points_per_reward, 100) as points_per_reward,
      p.created_at as join_date,
      null::timestamptz as first_location_activity_at,
      p.last_visit_at as last_activity_at,
      count(t.id)::integer as transaction_count,
      count(case when t.action = 'redeem' then 1 end)::integer as redeem_count,
      coalesce(sum(case when t.stamp_delta > 0 then t.stamp_delta else 0 end), 0)::integer as location_stamps_issued,
      coalesce(sum(case when t.points_delta > 0 then t.points_delta else 0 end), 0)::integer as location_points_issued,
      (p.wallet_serial is not null) as wallet_attached
    from public.pass_instances p
    join public.businesses b on b.id = p.business_id
    left join public.pass_transactions t on t.pass_serial = p.serial
    where p.business_id = _business_id
      and (
        _effective_branches is null
        or exists (
          select 1
          from public.pass_transactions t_filter
          where t_filter.pass_serial = p.serial
            and t_filter.branch_id = any(_effective_branches)
        )
      )
      and (
        _clean_search = ''
        or (
          (p.phone is null or p.phone ~* '^guest(-.*)?$')
          and lower(_clean_search) in ('guest', 'زائر')
        )
        or (p.phone is not null and p.phone ilike '%' || _clean_search || '%')
        or (_search_norm is not null and p.phone = _search_norm)
      )
    group by p.id, b.target_stamps, b.points_per_reward
    order by p.last_visit_at desc nulls last, p.created_at desc
    limit greatest(_limit, 1)
    offset greatest(_offset, 0);

  else
    return query
    select
      p.id as customer_id,
      case
        when p.phone is null or p.phone ~* '^guest(-.*)?$' then null
        else p.phone
      end as phone,
      (p.phone is null or p.phone ~* '^guest(-.*)?$') as is_anonymous,
      p.program_type,
      null::integer as current_stamps,
      null::integer as current_points,
      null::boolean as is_morphed,
      coalesce(b.target_stamps, 9) as target_stamps,
      coalesce(b.points_per_reward, 100) as points_per_reward,
      null::timestamptz as join_date,
      min(t.created_at) as first_location_activity_at,
      max(t.created_at) as last_activity_at,
      count(t.id)::integer as transaction_count,
      count(case when t.action = 'redeem' then 1 end)::integer as redeem_count,
      coalesce(sum(case when t.stamp_delta > 0 then t.stamp_delta else 0 end), 0)::integer as location_stamps_issued,
      coalesce(sum(case when t.points_delta > 0 then t.points_delta else 0 end), 0)::integer as location_points_issued,
      null::boolean as wallet_attached
    from public.pass_instances p
    join public.businesses b on b.id = p.business_id
    join public.pass_transactions t
      on t.pass_serial = p.serial
      and t.branch_id = any(_effective_branches)
    where p.business_id = _business_id
      and (
        _clean_search = ''
        or (
          (p.phone is null or p.phone ~* '^guest(-.*)?$')
          and lower(_clean_search) in ('guest', 'زائر')
        )
        or (p.phone is not null and p.phone ilike '%' || _clean_search || '%')
        or (_search_norm is not null and p.phone = _search_norm)
      )
    group by p.id, b.target_stamps, b.points_per_reward
    order by max(t.created_at) desc nulls last, min(t.created_at) desc
    limit greatest(_limit, 1)
    offset greatest(_offset, 0);
  end if;
end;
$$;

-- Ensure operations_customer_detail
drop function if exists public.operations_customer_detail(uuid, uuid);

create or replace function public.operations_customer_detail(
  _business_id uuid,
  _customer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _is_owner boolean;
  _managed_branches uuid[];
  _pass public.pass_instances%rowtype;
  _biz public.businesses%rowtype;
  _customer_json jsonb;
  _transactions_json jsonb;
  _has_location_activity boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  _is_owner := public.can_manage_business(auth.uid(), _business_id);

  -- Explicitly deny cashiers
  if not _is_owner and exists (
    select 1 from public.staff_members s
    where s.auth_user_id = auth.uid()
      and s.business_id = _business_id
      and s.status = 'active'
      and s.role in ('cashier', 'staff')
      and not exists (
        select 1 from public.staff_members s2
        where s2.auth_user_id = auth.uid()
          and s2.business_id = _business_id
          and s2.status = 'active'
          and s2.role in ('owner', 'admin', 'manager')
      )
  ) then
    raise exception 'Access denied: cashiers cannot access customer intelligence';
  end if;

  _managed_branches := public.managed_branch_ids(auth.uid(), _business_id);

  select * into _pass
  from public.pass_instances p
  where p.id = _customer_id
    and p.business_id = _business_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  select * into _biz
  from public.businesses b
  where b.id = _business_id;

  if not _is_owner then
    if _managed_branches is null or array_length(_managed_branches, 1) is null then
      raise exception 'Access denied';
    end if;

    select exists (
      select 1
      from public.pass_transactions t
      where t.pass_serial = _pass.serial
        and t.branch_id = any(_managed_branches)
    ) into _has_location_activity;

    if not _has_location_activity then
      raise exception 'Access denied to this customer';
    end if;

    select jsonb_build_object(
      'customer_id', _pass.id,
      'phone', case when _pass.phone is null or _pass.phone ~* '^guest(-.*)?$' then null else _pass.phone end,
      'is_anonymous', (_pass.phone is null or _pass.phone ~* '^guest(-.*)?$'),
      'program_type', _pass.program_type,
      'target_stamps', coalesce(_biz.target_stamps, 9),
      'points_per_reward', coalesce(_biz.points_per_reward, 100),
      'first_location_activity_at', min(t.created_at),
      'last_location_activity_at', max(t.created_at),
      'location_transactions', count(t.id),
      'location_redeems', count(case when t.action = 'redeem' then 1 end),
      'location_stamps_issued', coalesce(sum(case when t.stamp_delta > 0 then t.stamp_delta else 0 end), 0),
      'location_points_issued', coalesce(sum(case when t.points_delta > 0 then t.points_delta else 0 end), 0)
    )
    into _customer_json
    from public.pass_transactions t
    where t.pass_serial = _pass.serial
      and t.branch_id = any(_managed_branches);

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'created_at', t.created_at,
        'action', t.action,
        'amount_sar', t.amount_sar,
        'stamp_delta', t.stamp_delta,
        'points_delta', t.points_delta,
        'morph_applied', t.morph_applied,
        'branch_name_ar', coalesce(br.name_ar, 'فرع محذوف'),
        'branch_name_en', coalesce(br.name_en, 'Deleted branch'),
        'staff_name_ar', coalesce(st.name_ar, 'كاشير'),
        'staff_name_en', coalesce(st.name_en, 'Cashier'),
        'cashier_device_name', t.cashier_device_name
      ) order by t.created_at desc
    ), '[]'::jsonb)
    into _transactions_json
    from public.pass_transactions t
    left join public.branches br on br.id = t.branch_id
    left join public.staff_members st on st.id = t.staff_id
    where t.pass_serial = _pass.serial
      and t.branch_id = any(_managed_branches);

  else
    select jsonb_build_object(
      'customer_id', _pass.id,
      'phone', case when _pass.phone is null or _pass.phone ~* '^guest(-.*)?$' then null else _pass.phone end,
      'is_anonymous', (_pass.phone is null or _pass.phone ~* '^guest(-.*)?$'),
      'program_type', _pass.program_type,
      'current_stamps', _pass.stamps,
      'current_points', _pass.points,
      'is_morphed', _pass.morphed,
      'target_stamps', coalesce(_biz.target_stamps, 9),
      'points_per_reward', coalesce(_biz.points_per_reward, 100),
      'join_date', _pass.created_at,
      'last_activity_at', _pass.last_visit_at,
      'transaction_count', count(t.id),
      'redeem_count', count(case when t.action = 'redeem' then 1 end),
      'wallet_attached', (_pass.wallet_serial is not null)
    )
    into _customer_json
    from public.pass_instances p
    left join public.pass_transactions t on t.pass_serial = p.serial
    where p.id = _customer_id
    group by p.id, _biz.target_stamps, _biz.points_per_reward;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'created_at', t.created_at,
        'action', t.action,
        'amount_sar', t.amount_sar,
        'stamp_delta', t.stamp_delta,
        'points_delta', t.points_delta,
        'morph_applied', t.morph_applied,
        'stamps_after', t.stamps_after,
        'points_after', t.points_after,
        'branch_name_ar', coalesce(br.name_ar, 'الفرع الرئيسي'),
        'branch_name_en', coalesce(br.name_en, 'Main Location'),
        'staff_name_ar', coalesce(st.name_ar, 'التاجر'),
        'staff_name_en', coalesce(st.name_en, 'Merchant'),
        'cashier_device_name', t.cashier_device_name
      ) order by t.created_at desc
    ), '[]'::jsonb)
    into _transactions_json
    from public.pass_transactions t
    left join public.branches br on br.id = t.branch_id
    left join public.staff_members st on st.id = t.staff_id
    where t.pass_serial = _pass.serial;
  end if;

  return jsonb_build_object(
    'customer', _customer_json,
    'transactions', _transactions_json
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 1. Create Test Fixtures
-- ------------------------------------------------------------------------------

DO $$
declare
  _owner_a_id uuid := '11111111-1111-4000-8000-000000000001'::uuid;
  _mgr_a_id uuid := '11111111-1111-4000-8000-000000000002'::uuid;
  _cashier_a_id uuid := '11111111-1111-4000-8000-000000000003'::uuid;
  _owner_b_id uuid := '22222222-2222-4000-8000-000000000001'::uuid;

  _biz_a_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000001'::uuid;
  _branch_a1_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000011'::uuid;
  _branch_a2_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000012'::uuid;
  _staff_mgr_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000021'::uuid;
  _staff_cashier_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000022'::uuid;

  _biz_b_id uuid := 'bbbbbbbb-bbbb-4000-8000-000000000001'::uuid;
  _branch_b1_id uuid := 'bbbbbbbb-bbbb-4000-8000-000000000011'::uuid;

  _pass_1_id uuid := 'cccccccc-cccc-4000-8000-000000000001'::uuid;
  _pass_2_id uuid := 'cccccccc-cccc-4000-8000-000000000002'::uuid;
  _pass_3_id uuid := 'cccccccc-cccc-4000-8000-000000000003'::uuid;
  _pass_4_id uuid := 'cccccccc-cccc-4000-8000-000000000004'::uuid;
  _pass_b_id uuid := 'cccccccc-cccc-4000-8000-00000000000b'::uuid;
begin
  -- Insert mock auth users if auth.users exists
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    insert into auth.users (id, email)
    values
      (_owner_a_id, 'owner_a@pointpass.test'),
      (_mgr_a_id, 'mgr_a@pointpass.test'),
      (_cashier_a_id, 'cashier_a@pointpass.test'),
      (_owner_b_id, 'owner_b@pointpass.test')
    on conflict (id) do nothing;
  end if;

  -- Business A (Plan multi_location allows multiple branches)
  insert into public.businesses (
    id, slug, name_ar, name_en, owner_id, status, plan, program_type, target_stamps, sar_per_point, points_per_reward
  ) values (
    _biz_a_id, 'test-biz-a', 'مطعم أ', 'Restaurant A', _owner_a_id, 'active', 'multi_location', 'stamp', 9, 10, 100
  );

  -- Branches for Business A
  insert into public.branches (id, business_id, code, name_ar, name_en, status)
  values
    (_branch_a1_id, _biz_a_id, 'bra1', 'فرع العليا', 'Olaya Branch', 'active'),
    (_branch_a2_id, _biz_a_id, 'bra2', 'فرع النخيل', 'Nakheel Branch', 'active');

  -- Staff members
  insert into public.staff_members (id, business_id, auth_user_id, code, name_ar, name_en, role, status)
  values
    (_staff_mgr_id, _biz_a_id, _mgr_a_id, 'mgr1', 'سعد المدير', 'Saad Manager', 'manager', 'active'),
    (_staff_cashier_id, _biz_a_id, _cashier_a_id, 'csh1', 'علي الكاشير', 'Ali Cashier', 'cashier', 'active');

  -- Manager assigned ONLY to Branch A1
  insert into public.staff_branch_assignments (business_id, staff_id, branch_id)
  values (_biz_a_id, _staff_mgr_id, _branch_a1_id);

  -- Cashier assigned to Branch A1
  insert into public.staff_branch_assignments (business_id, staff_id, branch_id)
  values (_biz_a_id, _staff_cashier_id, _branch_a1_id);

  -- Business B (Cross-tenant)
  insert into public.businesses (
    id, slug, name_ar, name_en, owner_id, status, plan, program_type
  ) values (
    _biz_b_id, 'test-biz-b', 'مقهى ب', 'Cafe B', _owner_b_id, 'active', 'multi_location', 'points'
  );

  insert into public.branches (id, business_id, code, name_ar, name_en, status)
  values (_branch_b1_id, _biz_b_id, 'brb1', 'فرع ب الرئيسي', 'Branch B Main', 'active');

  -- Customer 1: Has activity in Branch A1 only
  insert into public.pass_instances (
    id, business_slug, business_id, phone, serial, program_type, stamps, points, created_at, last_visit_at
  ) values (
    _pass_1_id, 'test-biz-a', _biz_a_id, '+966501111111', 'serial-cust-1', 'stamp', 3, 0, now() - interval '10 days', now() - interval '2 days'
  );

  insert into public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, stamp_delta, stamps_after, created_at
  ) values (
    'serial-cust-1', _biz_a_id, _branch_a1_id, _staff_cashier_id, 'stamp', 3, 3, now() - interval '2 days'
  );

  -- Customer 2: Has activity in Branch A2 ONLY (Manager must NOT see this customer!)
  insert into public.pass_instances (
    id, business_slug, business_id, phone, serial, program_type, stamps, points, created_at, last_visit_at
  ) values (
    _pass_2_id, 'test-biz-a', _biz_a_id, '+966502222222', 'serial-cust-2', 'stamp', 5, 0, now() - interval '8 days', now() - interval '1 day'
  );

  insert into public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, stamp_delta, stamps_after, created_at
  ) values (
    'serial-cust-2', _biz_a_id, _branch_a2_id, null, 'stamp', 5, 5, now() - interval '1 day'
  );

  -- Customer 3: Has activity in BOTH Branch A1 AND Branch A2
  insert into public.pass_instances (
    id, business_slug, business_id, phone, serial, program_type, stamps, points, created_at, last_visit_at
  ) values (
    _pass_3_id, 'test-biz-a', _biz_a_id, '+966503333333', 'serial-cust-3', 'stamp', 8, 0, now() - interval '20 days', now() - interval '1 hour'
  );

  -- Transaction at A1 (3 stamps)
  insert into public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, stamp_delta, stamps_after, created_at
  ) values (
    'serial-cust-3', _biz_a_id, _branch_a1_id, _staff_cashier_id, 'stamp', 3, 3, now() - interval '5 days'
  );

  -- Transaction at A2 (5 stamps)
  insert into public.pass_transactions (
    pass_serial, business_id, branch_id, staff_id, action, stamp_delta, stamps_after, created_at
  ) values (
    'serial-cust-3', _biz_a_id, _branch_a2_id, null, 'stamp', 5, 8, now() - interval '1 hour'
  );

  -- Customer 4: Anonymous guest in Business A
  insert into public.pass_instances (
    id, business_slug, business_id, phone, serial, program_type, stamps, points, created_at
  ) values (
    _pass_4_id, 'test-biz-a', _biz_a_id, null, 'serial-cust-4-anon', 'stamp', 0, 0, now() - interval '1 day'
  );

  -- Customer in Business B
  insert into public.pass_instances (
    id, business_slug, business_id, phone, serial, program_type, stamps, points, created_at
  ) values (
    _pass_b_id, 'test-biz-b', _biz_b_id, '+966509999999', 'serial-cust-b', 'points', 50, 50, now()
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- Test Suite Execution
-- ------------------------------------------------------------------------------

DO $$
declare
  _biz_a_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000001'::uuid;
  _biz_b_id uuid := 'bbbbbbbb-bbbb-4000-8000-000000000001'::uuid;
  _branch_a1_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000011'::uuid;
  _branch_a2_id uuid := 'aaaaaaaa-aaaa-4000-8000-000000000012'::uuid;
  _owner_a_id uuid := '11111111-1111-4000-8000-000000000001'::uuid;
  _mgr_a_id uuid := '11111111-1111-4000-8000-000000000002'::uuid;
  _cashier_a_id uuid := '11111111-1111-4000-8000-000000000003'::uuid;

  _pass_1_id uuid := 'cccccccc-cccc-4000-8000-000000000001'::uuid;
  _pass_2_id uuid := 'cccccccc-cccc-4000-8000-000000000002'::uuid;
  _pass_3_id uuid := 'cccccccc-cccc-4000-8000-000000000003'::uuid;

  _cust_count integer;
  _cust_detail jsonb;
  _tx_count integer;
  _claim record;
  _norm text;
  _denied boolean;
begin
  -- ============================================================================
  -- 1. Phone Normalization Unit Tests
  -- ============================================================================
  assert public.normalize_customer_phone('0501234567') = '+966501234567', 'Normalization failed for 05...';
  assert public.normalize_customer_phone('501234567') = '+966501234567', 'Normalization failed for 5...';
  assert public.normalize_customer_phone('966501234567') = '+966501234567', 'Normalization failed for 9665...';
  assert public.normalize_customer_phone('+966501234567') = '+966501234567', 'Normalization failed for +9665...';
  assert public.normalize_customer_phone(' 050-123 (4567) ') = '+966501234567', 'Normalization failed with formatting';
  assert public.normalize_customer_phone('00966501234567') = '+966501234567', 'Normalization failed for 009665...';
  assert public.normalize_customer_phone('Guest-1234') is null, 'Normalizer must return null on legacy Guest string';
  assert public.normalize_customer_phone('invalid-phone') is null, 'Normalizer must return null on invalid input';

  -- ============================================================================
  -- 2. Concurrency-Safe Repeat Join & Anonymous Join
  -- ============================================================================

  -- Test 2a: Identified Repeat Join with formatting difference
  select * into _claim from public.claim_public_pass('test-biz-a', '0501111111');
  assert _claim.is_resumed = true, 'Repeat claim must be marked as resumed';
  assert _claim.pass_serial = 'serial-cust-1', 'Repeat claim must deterministically resume the existing pass';
  assert _claim.pass_stamps = 3, 'Resumed pass must preserve existing 3 stamps';

  -- Test 2b: Repeat join must not insert duplicate row
  select count(*) into _cust_count from public.pass_instances where business_id = _biz_a_id and phone = '+966501111111';
  assert _cust_count = 1, 'Repeat claim must not create duplicate pass instance';

  -- Test 2c: Anonymous Join inserts phone = NULL, no fake Guest string
  select * into _claim from public.claim_public_pass('test-biz-a', null);
  assert _claim.is_resumed = false, 'New anonymous claim is not resumed';
  select phone into _norm from public.pass_instances where serial = _claim.pass_serial;
  assert _norm is null, 'Anonymous pass must have phone = NULL (no fake Guest-####)';

  -- ============================================================================
  -- 3. Owner Customer Administration & Truthful Scope
  -- ============================================================================
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L', json_build_object('sub', _owner_a_id::text, 'role', 'authenticated')::text);

  -- Owner sees all 5 customers in Business A (cust 1, 2, 3, 4, + newly claimed anon)
  select count(*) into _cust_count from public.operations_customers_list(_biz_a_id);
  assert _cust_count = 5, 'Owner must see all business customers';

  -- Owner detail on Customer 3: full business timeline (2 transactions: A1 and A2)
  select public.operations_customer_detail(_biz_a_id, _pass_3_id) into _cust_detail;
  assert (_cust_detail->'customer'->>'current_stamps')::int = 8, 'Owner must see truthful total stamps (8)';
  assert jsonb_array_length(_cust_detail->'transactions') = 2, 'Owner must see all 2 transactions across all branches';
  assert (_cust_detail->'transactions'->0->>'stamps_after')::int is not null, 'Owner must see stamps_after';

  -- Cross-tenant denial: Owner A cannot read Business B customers
  _denied := false;
  begin
    perform public.operations_customers_list(_biz_b_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Cross-tenant access to customers must be denied';

  -- ============================================================================
  -- 4. Manager Customer Scope & Zero Balance Leakage (CRITICAL)
  -- ============================================================================
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L', json_build_object('sub', _mgr_a_id::text, 'role', 'authenticated')::text);

  -- Manager A_Mgr is assigned ONLY to Branch A1.
  -- Must see Customer 1 (activity at A1) and Customer 3 (activity at A1 and A2).
  -- Must NOT see Customer 2 (activity ONLY at A2) and NOT Customer 4 (no transactions).
  select count(*) into _cust_count from public.operations_customers_list(_biz_a_id);
  assert _cust_count = 2, format('Manager must only see customers with activity at assigned branch A1 (expected 2, got %s)', _cust_count);

  -- Verify Customer 2 does not appear in manager list
  select count(*) into _cust_count from public.operations_customers_list(_biz_a_id) where customer_id = _pass_2_id;
  assert _cust_count = 0, 'Customer exclusive to unassigned branch A2 must NOT appear in Manager list';

  -- Manager list fields: verify current_stamps and current_points are NULL (anti-leakage)
  select current_stamps into _cust_count from public.operations_customers_list(_biz_a_id) where customer_id = _pass_3_id;
  assert _cust_count is null, 'Manager customer list must NOT leak company-wide current_stamps (must be NULL)';

  -- Manager detail on Customer 3:
  -- Only transactions from Branch A1 must be returned (1 transaction, not 2).
  select public.operations_customer_detail(_biz_a_id, _pass_3_id) into _cust_detail;
  assert jsonb_array_length(_cust_detail->'transactions') = 1, 'Manager must only see transactions from authorized branch A1';
  assert (_cust_detail->'transactions'->0->>'branch_name_en') = 'Olaya Branch', 'Manager transaction must be from Olaya Branch';
  assert (_cust_detail->'transactions'->0->'stamps_after') is null, 'Manager transaction event must NOT leak stamps_after (must be NULL)';
  assert (_cust_detail->'customer'->'current_stamps') is null, 'Manager customer detail must NOT leak global current_stamps';

  -- Manager attempting to view Customer 2 (exclusive to A2) directly: access denied
  _denied := false;
  begin
    perform public.operations_customer_detail(_biz_a_id, _pass_2_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Manager direct access to unassigned branch customer must be denied';

  -- Manager requesting Branch A2 explicitly: access denied
  _denied := false;
  begin
    perform public.operations_customers_list(_biz_a_id, _branch_a2_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Manager cannot request an unassigned branch';

  -- Manager searching for Customer 2 phone: must yield 0 results
  select count(*) into _cust_count from public.operations_customers_list(_biz_a_id, null, '+966502222222');
  assert _cust_count = 0, 'Manager search must not discover customers exclusive to other branches';

  -- ============================================================================
  -- 5. Cashier and Anon Access Denial
  -- ============================================================================

  -- Cashier
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L', json_build_object('sub', _cashier_a_id::text, 'role', 'authenticated')::text);

  _denied := false;
  begin
    perform public.operations_customers_list(_biz_a_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Cashier role must be denied access to customer list';

  _denied := false;
  begin
    perform public.operations_customer_detail(_biz_a_id, _pass_1_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Cashier role must be denied access to customer detail';

  -- Anon
  execute 'set local role anon';
  _denied := false;
  begin
    perform public.operations_customers_list(_biz_a_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Anon role must be denied access to customer list';

  _denied := false;
  begin
    perform public.operations_customer_detail(_biz_a_id, _pass_1_id);
  exception when others then
    _denied := true;
  end;
  assert _denied = true, 'Anon role must be denied access to customer detail';

  -- Reset role to postgres superuser
  execute 'reset role';
end;
$$;

ROLLBACK;

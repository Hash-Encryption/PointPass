-- ==============================================================================
-- PointPass Phase 3 Migration:
-- Customers V1, Phone Normalization, Repeat Join & Concurrency Protection,
-- Manager Location Scoping with Zero Balance Leakage, and Customer Projections.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. Pass Instances Schema Evolution: Support truthful anonymous customers
-- ------------------------------------------------------------------------------

-- Allow phone to be null for anonymous guest claims.
alter table public.pass_instances alter column phone drop not null;

-- Add indexes for fast identified customer lookup and timeline queries
create index if not exists pass_instances_business_phone_idx
  on public.pass_instances (business_id, phone)
  where phone is not null;

create index if not exists pass_instances_business_created_idx
  on public.pass_instances (business_id, created_at desc);

create index if not exists pass_transactions_pass_serial_created_idx
  on public.pass_transactions (pass_serial, created_at desc);

-- ------------------------------------------------------------------------------
-- 2. Phone Normalization Helper
-- Conservative, Saudi-first E.164 normalization that safely returns NULL for
-- legacy garbage or non-phone strings without throwing exceptions.
-- ------------------------------------------------------------------------------

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

  -- Strip all whitespace, dashes, parentheses, dots, slashes
  _cleaned := regexp_replace(trim(_raw), '[^\+0-9]', '', 'g');

  if _cleaned is null or _cleaned = '' then
    return null;
  end if;

  -- Saudi mobile numbers (canonical: +9665xxxxxxxx)
  -- Form: 05xxxxxxxx (10 digits)
  if _cleaned ~ '^05[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 3);
  end if;

  -- Form: 5xxxxxxxx (9 digits)
  if _cleaned ~ '^5[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 2);
  end if;

  -- Form: 9665xxxxxxxx (12 digits)
  if _cleaned ~ '^9665[0-9]{8}$' then
    return '+' || _cleaned;
  end if;

  -- Form: +9665xxxxxxxx (13 chars)
  if _cleaned ~ '^\+9665[0-9]{8}$' then
    return _cleaned;
  end if;

  -- Form: 009665xxxxxxxx (14 digits)
  if _cleaned ~ '^009665[0-9]{8}$' then
    return '+9665' || substr(_cleaned, 7);
  end if;

  -- Valid international E.164 formats: + followed by 7-15 digits (first digit 1-9)
  if _cleaned ~ '^\+[1-9][0-9]{6,14}$' then
    return _cleaned;
  end if;

  -- 00 followed by country code + subscriber digits
  if _cleaned ~ '^00[1-9][0-9]{6,14}$' then
    return '+' || substr(_cleaned, 3);
  end if;

  -- If it doesn't match standard phone formats (e.g. legacy Guest-1234 or corrupt),
  -- return NULL safely so callers can differentiate or fall back gracefully.
  return null;
end;
$$;

revoke all on function public.normalize_customer_phone(text) from public;
grant execute on function public.normalize_customer_phone(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. Repeat-Join & Concurrency Safe claim_public_pass
-- Deterministic existing pass resolution, advisory lock duplicate protection,
-- and truthful loyalty state return.
-- ------------------------------------------------------------------------------

-- Drop existing function to permit altering return table columns (OUT parameters)
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
  -- 1. Validate active business
  select b.* into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active';

  if not found then
    raise exception 'Business not found or inactive';
  end if;

  -- 2. Differentiate Identified Customer vs Anonymous Guest
  if _phone is not null and trim(_phone) <> '' then
    _normalized_phone := public.normalize_customer_phone(_phone);
    if _normalized_phone is null then
      raise exception 'Phone identifier must contain a valid phone number';
    end if;

    -- Concurrency Protection: Acquire transactional advisory lock keyed by (business_id, normalized_phone)
    -- This guarantees concurrent claims for the same customer cannot produce duplicate passes.
    perform pg_advisory_xact_lock(hashtext('pass_claim:' || _business.id::text || ':' || _normalized_phone));

    -- Deterministic Existing Pass Lookup:
    -- In accordance with Phase 3 specifications:
    -- 1. Prefer pass with an attached wallet (wallet_serial is not null)
    -- 2. Prefer most recently active pass (last_visit_at desc nulls last)
    -- 3. Prefer older canonical pass (created_at asc)
    -- 4. Stable tiebreaker (id asc)
    -- Historical duplicates are NEVER deleted or merged.
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
      -- Resumed existing pass: preserve all stamps, points, morph, and history intact!
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
        true; -- is_resumed
      return;
    end if;

    -- New Identified Customer: insert with canonical normalized phone
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
      false; -- is_resumed

  else
    -- Anonymous Guest: Phone is explicitly NULL. No fake "Guest-####" generation.
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
      false; -- is_resumed
  end if;
end;
$$;

revoke all on function public.claim_public_pass(text, text) from public;
grant execute on function public.claim_public_pass(text, text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3b. Helper: managed_branch_ids
-- Returns active branch IDs managed by the user, or all active branches if owner.
-- ------------------------------------------------------------------------------

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

revoke all on function public.managed_branch_ids(uuid, uuid) from public;
grant execute on function public.managed_branch_ids(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Customers V1 List RPC
-- operations_customers_list
-- Role-scoped:
--   Owner: Business-wide or branch-filtered, returns global loyalty balance.
--   Manager: Strictly scoped to customers with transactions at assigned branches.
--            CRITICAL: Does NOT return company-wide current_stamps/points,
--            preventing cross-location data leakage.
-- Drop existing function to permit altering return table columns safely
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
    -- OWNER VIEW: full business loyalty visibility
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
    -- MANAGER VIEW: Location-scoped ONLY.
    -- Crucially: current_stamps, current_points, is_morphed, join_date, and wallet_attached are NULL
    -- to prevent cross-location balance leakage.
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
      null::timestamptz as join_date, -- Manager does not see company-wide pass creation date
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

revoke all on function public.operations_customers_list(uuid, uuid, text, integer, integer) from public;
grant execute on function public.operations_customers_list(uuid, uuid, text, integer, integer) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Customers V1 Detail RPC
-- operations_customer_detail
-- Returns customer profile + chronological activity events.
-- Manager: transactions and metrics strictly limited to assigned branches.
-- Drop existing function if present
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

  -- Fetch pass
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

    -- Verify customer has activity at manager's authorized branch(es)
    select exists (
      select 1
      from public.pass_transactions t
      where t.pass_serial = _pass.serial
        and t.branch_id = any(_managed_branches)
    ) into _has_location_activity;

    if not _has_location_activity then
      raise exception 'Access denied to this customer';
    end if;

    -- Build Manager Customer Profile (NO GLOBAL BALANCES)
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

    -- Build Manager Transactions List (ONLY AUTHORIZED BRANCHES, NO BALANCES AFTER)
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
    -- OWNER VIEW: full loyalty profile and all business transactions
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

revoke all on function public.operations_customer_detail(uuid, uuid) from public;
grant execute on function public.operations_customer_detail(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Customers V1 Dashboard Summary RPC
-- operations_dashboard_summary
-- Supplies scoped customer counts without requiring client-side full scan.
-- Drop existing function if present
drop function if exists public.operations_dashboard_summary(uuid, uuid);

create or replace function public.operations_dashboard_summary(
  _business_id uuid,
  _branch_id uuid default null
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
  _effective_branches uuid[];
  _total bigint;
  _new_30d bigint;
  _identified bigint;
  _anonymous bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  _is_owner := public.can_manage_business(auth.uid(), _business_id);
  _managed_branches := public.managed_branch_ids(auth.uid(), _business_id);

  if not _is_owner then
    if _managed_branches is null or array_length(_managed_branches, 1) is null then
      raise exception 'Access denied to dashboard summary';
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

  if _is_owner and _effective_branches is null then
    -- Business-wide Owner metrics
    select
      count(*),
      count(case when created_at >= (now() - interval '30 days') then 1 end),
      count(case when phone is not null and not phone ~* '^guest(-.*)?$' then 1 end),
      count(case when phone is null or phone ~* '^guest(-.*)?$' then 1 end)
    into _total, _new_30d, _identified, _anonymous
    from public.pass_instances
    where business_id = _business_id;

  else
    -- Location-scoped metrics (Manager or branch-filtered Owner)
    -- For Manager, "new_customers_30d" is strictly based on when the customer had their
    -- first activity in the authorized branch(es).
    with location_customers as (
      select
        p.id,
        p.phone,
        min(t.created_at) as first_location_time
      from public.pass_instances p
      join public.pass_transactions t
        on t.pass_serial = p.serial
        and t.branch_id = any(_effective_branches)
      where p.business_id = _business_id
      group by p.id, p.phone
    )
    select
      count(*),
      count(case when first_location_time >= (now() - interval '30 days') then 1 end),
      count(case when phone is not null and not phone ~* '^guest(-.*)?$' then 1 end),
      count(case when phone is null or phone ~* '^guest(-.*)?$' then 1 end)
    into _total, _new_30d, _identified, _anonymous
    from location_customers;
  end if;

  return jsonb_build_object(
    'total_customers', coalesce(_total, 0),
    'new_customers_30d', coalesce(_new_30d, 0),
    'identified_customers', coalesce(_identified, 0),
    'anonymous_customers', coalesce(_anonymous, 0)
  );
end;
$$;

revoke all on function public.operations_dashboard_summary(uuid, uuid) from public;
grant execute on function public.operations_dashboard_summary(uuid, uuid) to authenticated;

commit;

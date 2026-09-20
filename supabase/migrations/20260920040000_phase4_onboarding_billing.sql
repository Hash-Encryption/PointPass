begin;

-- ============================================================================
-- 1. AUTHORITATIVE PLAN CATALOG DOMAIN
-- ============================================================================
create table if not exists public.plans (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  max_locations integer not null check (max_locations > 0),
  created_at timestamptz not null default now()
);

-- Authoritative operational plan catalog values (no fabricated commercial packaging)
insert into public.plans (code, name_ar, name_en, is_active, max_locations)
values
  ('single_location', 'فرع واحد', 'Single Location', true, 1),
  ('multi_location', 'فروع متعددة', 'Multi-Location', true, 10)
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  is_active = excluded.is_active,
  max_locations = excluded.max_locations;

alter table public.plans enable row level security;

drop policy if exists "anyone can read active plans" on public.plans;
create policy "anyone can read active plans"
on public.plans for select
to anon, authenticated
using (is_active = true);

revoke insert, update, delete on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;

-- ============================================================================
-- 2. DURABLE SUBSCRIPTION & BILLING DOMAIN
-- ============================================================================
create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid unique not null references public.businesses(id) on delete cascade,
  plan_code text not null references public.plans(code),
  requested_plan_code text references public.plans(code),
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled', 'inactive', 'legacy')),
  billing_provider text,
  external_customer_id text,
  external_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_subscriptions enable row level security;

-- Owner-only read access; Manager, Cashier, anon are strictly denied
drop policy if exists "owner reads business subscription" on public.business_subscriptions;
create policy "owner reads business subscription"
on public.business_subscriptions for select
to authenticated
using (public.can_manage_business(auth.uid(), business_id));

-- Browser cannot directly insert, update, or delete subscription records
revoke insert, update, delete on public.business_subscriptions from anon, authenticated;
grant select on public.business_subscriptions to authenticated;
grant all on public.business_subscriptions to service_role;

-- ============================================================================
-- 3. RESUMABLE ONBOARDING DOMAIN
-- ============================================================================
create table if not exists public.business_onboarding (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  step text not null default 'business' check (step in ('business', 'plan', 'loyalty', 'reward', 'location', 'launch', 'completed')),
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.business_onboarding enable row level security;

drop policy if exists "members read onboarding state" on public.business_onboarding;
create policy "members read onboarding state"
on public.business_onboarding for select
to authenticated
using (public.can_access_business(auth.uid(), business_id));

drop policy if exists "owner updates onboarding state" on public.business_onboarding;
create policy "owner updates onboarding state"
on public.business_onboarding for update
to authenticated
using (public.can_manage_business(auth.uid(), business_id))
with check (public.can_manage_business(auth.uid(), business_id));

revoke insert, delete on public.business_onboarding from anon, authenticated;
grant select, update on public.business_onboarding to authenticated;
grant all on public.business_onboarding to service_role;

-- ============================================================================
-- 4. EXISTING BUSINESS BACKFILL
-- ============================================================================
-- Backfill subscriptions with existing effective plan and truthful legacy status (no fake payments/dates)
insert into public.business_subscriptions (
  business_id,
  plan_code,
  requested_plan_code,
  status,
  billing_provider,
  external_customer_id,
  external_subscription_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
)
select
  b.id,
  case
    when b.plan in ('multi_location', 'growth', 'enterprise') then 'multi_location'
    else 'single_location'
  end,
  null,
  'legacy',
  null,
  null,
  null,
  null,
  null,
  false,
  b.created_at,
  now()
from public.businesses b
where not exists (
  select 1 from public.business_subscriptions s where s.business_id = b.id
);

-- Backfill existing businesses as onboarding-complete without fabricating historical completion timestamps
insert into public.business_onboarding (
  business_id,
  step,
  completed,
  started_at,
  completed_at,
  updated_at
)
select
  b.id,
  'completed',
  true,
  b.created_at,
  now(),
  now()
from public.businesses b
where not exists (
  select 1 from public.business_onboarding o where o.business_id = b.id
);

-- ============================================================================
-- 5. SERVER-AUTHORITATIVE LOCATION ENTITLEMENT
-- ============================================================================
create or replace function public.business_location_entitlement(_business_id uuid)
returns table (
  plan text,
  max_locations integer,
  multi_location boolean,
  location_comparison boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when b.plan in ('multi_location', 'growth', 'enterprise') then 'multi_location'
      else 'single_location'
    end as plan,
    case
      when b.plan in ('multi_location', 'growth', 'enterprise') then 10
      else 1
    end as max_locations,
    case
      when b.plan in ('multi_location', 'growth', 'enterprise') then true
      else false
    end as multi_location,
    case
      when b.plan in ('multi_location', 'growth', 'enterprise') then true
      else false
    end as location_comparison
  from public.businesses b
  where b.id = _business_id;
$$;

grant execute on function public.business_location_entitlement(uuid) to authenticated, service_role;

-- ============================================================================
-- 6. SECURE SELF-SERVICE OWNER BOOTSTRAP RPC
-- ============================================================================
create or replace function public.bootstrap_owner_business(
  _slug text,
  _name_ar text,
  _name_en text,
  _plan text default 'single_location'
)
returns table (
  business_id uuid,
  slug text,
  name_ar text,
  name_en text,
  effective_plan text,
  onboarding_step text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller_id uuid := auth.uid();
  _clean_slug text := lower(trim(_slug));
  _clean_name_ar text := trim(_name_ar);
  _clean_name_en text := trim(_name_en);
  _clean_plan text := lower(trim(coalesce(_plan, 'single_location')));
  _existing_incomplete_id uuid;
  _new_biz_id uuid;
  _canonical_plan text;
begin
  if _caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- Advisory lock scoped to the caller's session to serialize double-submits
  perform pg_advisory_xact_lock(hashtext('bootstrap_' || _caller_id::text));

  -- Normalize requested plan
  if _clean_plan in ('multi_location', 'growth', 'enterprise') then
    _canonical_plan := 'multi_location';
  else
    _canonical_plan := 'single_location';
  end if;

  -- Check if user already has an incomplete onboarding business created very recently
  select b.id into _existing_incomplete_id
  from public.businesses b
  join public.business_onboarding o on o.business_id = b.id
  where b.owner_id = _caller_id
    and o.completed = false
  order by b.created_at desc
  limit 1;

  if _existing_incomplete_id is not null then
    return query
    select
      b.id,
      b.slug,
      b.name_ar,
      b.name_en,
      b.plan,
      o.step
    from public.businesses b
    join public.business_onboarding o on o.business_id = b.id
    where b.id = _existing_incomplete_id;
    return;
  end if;

  -- Validate slug format
  if _clean_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(_clean_slug) not between 2 and 64 then
    raise exception 'Invalid business slug format';
  end if;

  -- Validate business names
  if length(_clean_name_ar) not between 2 and 120 or length(_clean_name_en) not between 2 and 120 then
    raise exception 'Business names must be between 2 and 120 characters';
  end if;

  -- Enforce slug uniqueness without overwriting
  if exists (select 1 from public.businesses where slug = _clean_slug) then
    raise exception 'Business slug already taken';
  end if;

  -- Atomic business creation with single_location operational baseline
  insert into public.businesses (
    owner_id,
    slug,
    name_ar,
    name_en,
    plan,
    status
  ) values (
    _caller_id,
    _clean_slug,
    _clean_name_ar,
    _clean_name_en,
    'single_location',
    'active'
  )
  returning id into _new_biz_id;

  -- Automatic Main Location trigger trg_ensure_business_main_branch fired and created 'main' location.

  -- Assign merchant business role
  insert into public.user_roles (user_id, role, business_id)
  values (_caller_id, 'merchant', _new_biz_id)
  on conflict do nothing;

  -- Initialize truthful subscription state (pending, unconfigured provider, baseline single_location)
  insert into public.business_subscriptions (
    business_id,
    plan_code,
    requested_plan_code,
    status,
    billing_provider
  ) values (
    _new_biz_id,
    'single_location',
    _canonical_plan,
    'pending',
    null
  );

  -- Initialize onboarding tracking
  insert into public.business_onboarding (
    business_id,
    step,
    completed,
    started_at,
    updated_at
  ) values (
    _new_biz_id,
    'plan',
    false,
    now(),
    now()
  );

  return query
  select
    _new_biz_id,
    _clean_slug,
    _clean_name_ar,
    _clean_name_en,
    'starter'::text,
    'plan'::text;
end;
$$;

revoke all on function public.bootstrap_owner_business(text, text, text, text) from public;
grant execute on function public.bootstrap_owner_business(text, text, text, text) to authenticated;

-- ============================================================================
-- 7. NARROW, STRONGLY VALIDATED ONBOARDING STEP SAVING RPC
-- ============================================================================
create or replace function public.save_onboarding_step(
  _business_id uuid,
  _step text,
  _requested_plan text default null,
  _program_type public.program_type default null,
  _brand_color text default null,
  _accent_color text default null,
  _offer_ar text default null,
  _offer_en text default null,
  _target_stamps integer default null,
  _sar_per_point integer default null,
  _points_per_reward integer default null,
  _main_branch_name_ar text default null,
  _main_branch_name_en text default null,
  _main_branch_address_ar text default null,
  _main_branch_address_en text default null
)
returns table (
  step text,
  completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _clean_step text := lower(trim(_step));
  _clean_plan text := lower(trim(coalesce(_requested_plan, '')));
begin
  -- Validate Owner management permission
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Onboarding step update denied';
  end if;

  if _clean_step not in ('business', 'plan', 'loyalty', 'reward', 'location', 'launch') then
    raise exception 'Invalid onboarding step';
  end if;

  -- Step: Plan selection
  if _clean_plan <> '' then
    if _clean_plan in ('multi_location', 'growth', 'enterprise') then
      _clean_plan := 'multi_location';
    else
      _clean_plan := 'single_location';
    end if;

    if not exists (select 1 from public.plans where code = _clean_plan and is_active = true) then
      raise exception 'Selected plan is not available';
    end if;

    update public.business_subscriptions
    set requested_plan_code = _clean_plan,
        updated_at = now()
    where business_id = _business_id;
  end if;

  -- Step: Loyalty & Reward configuration
  if _program_type is not null then
    if _target_stamps is not null and _target_stamps <= 0 then
      raise exception 'Target stamps must be greater than zero';
    end if;
    if _sar_per_point is not null and _sar_per_point <= 0 then
      raise exception 'SAR per point must be greater than zero';
    end if;
    if _points_per_reward is not null and _points_per_reward <= 0 then
      raise exception 'Points per reward must be greater than zero';
    end if;

    if _brand_color is not null and _brand_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Invalid brand color hex code';
    end if;
    if _accent_color is not null and _accent_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'Invalid accent color hex code';
    end if;

    update public.businesses
    set program_type = _program_type,
        brand_color = coalesce(_brand_color, brand_color),
        accent_color = coalesce(_accent_color, accent_color),
        offer_ar = coalesce(_offer_ar, offer_ar),
        offer_en = coalesce(_offer_en, offer_en),
        target_stamps = coalesce(_target_stamps, target_stamps),
        sar_per_point = coalesce(_sar_per_point, sar_per_point),
        points_per_reward = coalesce(_points_per_reward, points_per_reward)
    where id = _business_id;
  end if;

  -- Step: Main Location confirmation/update
  if _main_branch_name_ar is not null or _main_branch_name_en is not null or _main_branch_address_ar is not null or _main_branch_address_en is not null then
    update public.branches
    set name_ar = coalesce(nullif(trim(_main_branch_name_ar), ''), name_ar),
        name_en = coalesce(nullif(trim(_main_branch_name_en), ''), name_en),
        address_ar = coalesce(nullif(trim(_main_branch_address_ar), ''), address_ar),
        address_en = coalesce(nullif(trim(_main_branch_address_en), ''), address_en),
        updated_at = now()
    where business_id = _business_id
      and lower(code) = 'main';
  end if;

  -- Advance onboarding step
  update public.business_onboarding
  set step = _clean_step,
      updated_at = now()
  where business_id = _business_id;

  return query
  select o.step, o.completed
  from public.business_onboarding o
  where o.business_id = _business_id;
end;
$$;

revoke all on function public.save_onboarding_step from public;
grant execute on function public.save_onboarding_step to authenticated;

-- ============================================================================
-- 8. AUTHORITATIVE ONBOARDING COMPLETION RPC
-- ============================================================================
create or replace function public.complete_onboarding(_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Onboarding completion denied';
  end if;

  update public.business_onboarding
  set step = 'completed',
      completed = true,
      completed_at = now(),
      updated_at = now()
  where business_id = _business_id;

  return true;
end;
$$;

revoke all on function public.complete_onboarding(uuid) from public;
grant execute on function public.complete_onboarding(uuid) to authenticated;

-- ============================================================================
-- 9. SAFE PLAN CHANGE REQUEST & DOWNGRADE PROTECTION RPC
-- ============================================================================
create or replace function public.request_business_plan_change(
  _business_id uuid,
  _target_plan text
)
returns table (
  effective_plan text,
  requested_plan text,
  status text,
  message_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _target_max integer;
  _active_locations integer;
  _current_plan text;
  _clean_plan text := lower(trim(_target_plan));
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Plan management denied';
  end if;

  if _clean_plan in ('multi_location', 'growth', 'enterprise') then
    _clean_plan := 'multi_location';
  else
    _clean_plan := 'single_location';
  end if;

  select max_locations into _target_max
  from public.plans
  where code = _clean_plan and is_active = true;

  if _target_max is null then
    raise exception 'Target plan does not exist or is inactive';
  end if;

  -- Active locations count validation (downgrade protection)
  select count(*) into _active_locations
  from public.branches
  where business_id = _business_id and status = 'active';

  if _active_locations > _target_max then
    raise exception 'Cannot change plan: current active locations (%) exceed target plan limit (%)', _active_locations, _target_max;
  end if;

  -- Record requested plan on business_subscriptions
  update public.business_subscriptions
  set requested_plan_code = _clean_plan,
      updated_at = now()
  where business_id = _business_id;

  select plan_code into _current_plan
  from public.business_subscriptions
  where business_id = _business_id;

  -- Return truthful response: online billing is not configured, effective plan unchanged
  return query select
    coalesce(_current_plan, 'single_location'),
    _clean_plan,
    'billing_unconfigured'::text,
    'ONLINE_BILLING_NOT_CONFIGURED'::text;
end;
$$;

revoke all on function public.request_business_plan_change(uuid, text) from public;
grant execute on function public.request_business_plan_change(uuid, text) to authenticated;

-- ============================================================================
-- 10. AUTHORITATIVE BILLING & USAGE STATE RPC
-- ============================================================================
create or replace function public.get_business_billing_state(_business_id uuid)
returns table (
  plan_code text,
  plan_name_ar text,
  plan_name_en text,
  requested_plan_code text,
  subscription_status text,
  billing_provider text,
  active_locations integer,
  max_locations integer,
  can_add_location boolean,
  provider_configured boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _active_locs integer;
  _max_locs integer;
  _plan_rec record;
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Billing access denied';
  end if;

  select count(*) into _active_locs
  from public.branches
  where business_id = _business_id and status = 'active';

  select max_locations into _max_locs
  from public.business_location_entitlement(_business_id);

  _max_locs := coalesce(_max_locs, 1);

  return query
  select
    coalesce(s.plan_code, case when b.plan in ('multi_location', 'growth', 'enterprise') then 'multi_location' else 'single_location' end),
    coalesce(p.name_ar, case when coalesce(s.plan_code, b.plan) in ('multi_location', 'growth', 'enterprise') then 'فروع متعددة' else 'فرع واحد' end),
    coalesce(p.name_en, case when coalesce(s.plan_code, b.plan) in ('multi_location', 'growth', 'enterprise') then 'Multi-Location' else 'Single Location' end),
    s.requested_plan_code,
    coalesce(s.status, 'legacy'),
    s.billing_provider,
    _active_locs,
    _max_locs,
    (_active_locs < _max_locs),
    false::boolean -- provider_configured is false (truthful)
  from public.businesses b
  left join public.business_subscriptions s on s.business_id = b.id
  left join public.plans p on p.code = s.plan_code
  where b.id = _business_id;
end;
$$;

revoke all on function public.get_business_billing_state(uuid) from public;
grant execute on function public.get_business_billing_state(uuid) to authenticated;

commit;

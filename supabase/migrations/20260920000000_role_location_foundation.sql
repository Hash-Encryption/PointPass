begin;

-- ============================================================================
-- 1. AUTOMATIC MAIN LOCATION ARCHITECTURE FOR NEW BUSINESSES
-- ============================================================================
-- When a new business is inserted, automatically create an initial active branch
-- with code 'main' and standard bilingual names ('الفرع الرئيسي' / 'Main Location').
-- Idempotent: does not duplicate if already present.
-- Preserves existing businesses without branches (no fabricated historical locations).
create or replace function public.ensure_business_main_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branches (
    business_id,
    code,
    name_ar,
    name_en,
    status
  ) values (
    new.id,
    'main',
    'الفرع الرئيسي',
    'Main Location',
    'active'
  )
  on conflict (business_id, lower(code)) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_business_main_branch on public.businesses;
create trigger trg_ensure_business_main_branch
after insert on public.businesses
for each row execute function public.ensure_business_main_branch();

-- ============================================================================
-- 2. LOCATION ENTITLEMENT FOUNDATION
-- ============================================================================
-- Conceptual model:
--   single_location: max_locations = 1, multi_location = false, location_comparison = false
--   multi_location: max_locations = configured_multi_limit (10), multi_location = true, location_comparison = true
-- Legacy plan names mapped for compatibility:
--   starter -> single_location (1)
--   growth, enterprise, multi_location -> multi_location (10)
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
    b.plan,
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
-- 3. AUTHORITATIVE LOCATION COUNT ENFORCEMENT
-- ============================================================================
-- Enforce max_locations at the database level for all inserts and status updates.
-- Advisory locking on business_id serializes concurrent attempts to prevent race-condition bypass.
create or replace function public.enforce_branch_location_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _max_allowed integer;
  _active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('branch_limit_' || new.business_id::text));

  select max_locations into _max_allowed
  from public.business_location_entitlement(new.business_id);

  if _max_allowed is null then
    _max_allowed := 1;
  end if;

  select count(*) into _active_count
  from public.branches b
  where b.business_id = new.business_id
    and b.status = 'active'
    and (tg_op = 'INSERT' or b.id <> new.id);

  if _active_count >= _max_allowed then
    raise exception 'Location limit exceeded: business is limited to % active location(s) under current plan', _max_allowed;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_branch_location_limit on public.branches;
create trigger trg_enforce_branch_location_limit
before insert or update of status, business_id on public.branches
for each row execute function public.enforce_branch_location_limit();

-- ============================================================================
-- 4. BRANCH UPSERT RPC LIMIT ENFORCEMENT & COMPATIBILITY
-- ============================================================================
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
  _clean_code text := lower(trim(_code));
  _max_allowed integer;
  _active_count integer;
begin
  if _branch_id is null then
    if not public.can_manage_business(auth.uid(), _business_id) then
      raise exception 'Branch creation denied';
    end if;

    if _status = 'active' then
      perform pg_advisory_xact_lock(hashtext('branch_limit_' || _business_id::text));

      select max_locations into _max_allowed
      from public.business_location_entitlement(_business_id);

      select count(*) into _active_count
      from public.branches b
      where b.business_id = _business_id and b.status = 'active';

      if _active_count >= coalesce(_max_allowed, 1) then
        raise exception 'Location limit exceeded: business is limited to % active location(s) under current plan', coalesce(_max_allowed, 1);
      end if;
    end if;
  elsif not exists (
    select 1 from public.branches b
    where b.id = _branch_id and b.business_id = _business_id
      and public.can_manage_branch(auth.uid(), b.id)
  ) then
    raise exception 'Branch update denied';
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

-- ============================================================================
-- 5. STRICT MANAGER READ & WRITE ISOLATION (RLS)
-- ============================================================================
-- Branches: Owner/Admin reads all business branches.
-- Managers and staff read ONLY branches to which they are assigned.
drop policy if exists "members read business branches" on public.branches;
drop policy if exists "authorized members read business branches" on public.branches;

create policy "authorized members read business branches"
on public.branches for select to authenticated
using (
  public.can_manage_business(auth.uid(), business_id)
  or exists (
    select 1
    from public.staff_members s
    join public.staff_branch_assignments a
      on a.staff_id = s.id and a.business_id = s.business_id
    where s.auth_user_id = auth.uid()
      and s.business_id = branches.business_id
      and s.status = 'active'
      and a.branch_id = branches.id
  )
);

-- Staff branch assignments: Owner/Admin reads all assignments in the business.
-- Managers and staff read ONLY assignments for branches they are assigned to.
drop policy if exists "members read branch assignments" on public.staff_branch_assignments;
drop policy if exists "authorized members read branch assignments" on public.staff_branch_assignments;

create policy "authorized members read branch assignments"
on public.staff_branch_assignments for select to authenticated
using (
  public.can_manage_business(auth.uid(), business_id)
  or exists (
    select 1
    from public.staff_members s
    join public.staff_branch_assignments a
      on a.staff_id = s.id and a.business_id = s.business_id
    where s.auth_user_id = auth.uid()
      and s.business_id = staff_branch_assignments.business_id
      and s.status = 'active'
      and a.branch_id = staff_branch_assignments.branch_id
  )
);

-- Staff members: Owner/Admin reads all staff in the business.
-- Managers and staff read their own record or other staff assigned to the same branch.
drop policy if exists "members read business staff" on public.staff_members;
drop policy if exists "authorized members read business staff" on public.staff_members;

create policy "authorized members read business staff"
on public.staff_members for select to authenticated
using (
  public.can_manage_business(auth.uid(), business_id)
  or auth_user_id = auth.uid()
  or exists (
    select 1
    from public.staff_branch_assignments my_a
    join public.staff_members me
      on me.id = my_a.staff_id and me.business_id = my_a.business_id
    join public.staff_branch_assignments other_a
      on other_a.branch_id = my_a.branch_id and other_a.business_id = my_a.business_id
    where me.auth_user_id = auth.uid()
      and me.business_id = staff_members.business_id
      and me.status = 'active'
      and other_a.staff_id = staff_members.id
  )
);

-- ============================================================================
-- 6. ENHANCED OPERATIONS ACCESS RPC
-- ============================================================================
-- Returns canonical role, business management permission, and explicit managed branch IDs.
create or replace function public.operations_access(_business_id uuid)
returns table (
  operational_role text,
  can_manage boolean,
  can_manage_business boolean,
  managed_branch_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _is_owner boolean;
  _staff_role text;
  _role text;
  _can_manage_biz boolean;
  _managed_branches uuid[];
begin
  if not public.can_access_business(auth.uid(), _business_id) then
    raise exception 'Business access denied';
  end if;

  _can_manage_biz := public.can_manage_business(auth.uid(), _business_id);

  select (
    public.has_role(auth.uid(), 'super_admin')
    or exists (select 1 from public.businesses b where b.id = _business_id and b.owner_id = auth.uid())
    or exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.business_id = _business_id and r.role = 'merchant')
  ) into _is_owner;

  select s.role into _staff_role
  from public.staff_members s
  where s.auth_user_id = auth.uid()
    and s.business_id = _business_id
    and s.status = 'active'
  order by case s.role
    when 'owner' then 1
    when 'admin' then 2
    when 'manager' then 3
    when 'staff' then 4
    when 'cashier' then 5
    else 6
  end
  limit 1;

  if _is_owner or _staff_role in ('owner', 'admin') then
    _role := 'owner';
  elsif _staff_role = 'manager' then
    _role := 'manager';
  elsif _staff_role = 'cashier' then
    _role := 'cashier';
  elsif _staff_role = 'staff' then
    _role := 'staff';
  else
    _role := case when _can_manage_biz then 'owner' else 'staff' end;
  end if;

  if _can_manage_biz then
    select coalesce(array_agg(b.id), array[]::uuid[]) into _managed_branches
    from public.branches b
    where b.business_id = _business_id and b.status = 'active';
  elsif _role = 'manager' then
    select coalesce(array_agg(a.branch_id), array[]::uuid[]) into _managed_branches
    from public.staff_members s
    join public.staff_branch_assignments a
      on a.staff_id = s.id and a.business_id = s.business_id
    where s.auth_user_id = auth.uid()
      and s.business_id = _business_id
      and s.status = 'active'
      and s.role = 'manager';
  else
    _managed_branches := array[]::uuid[];
  end if;

  return query select
    _role,
    _can_manage_biz,
    _can_manage_biz,
    _managed_branches;
end;
$$;

revoke all on function public.operations_access(uuid) from public;
grant execute on function public.operations_access(uuid) to authenticated;

commit;

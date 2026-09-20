-- Phase 2: Locations & Team + Clean Operations UX
-- Forward-only migration establishing safe PIN status projection, internal code generation,
-- auto-generation in branch upsert, transactional team member save, and anti-recursion RLS architecture.

begin;

-- 0. Anti-recursion RLS helpers & policies (Idempotent foundation)
-- Centralize permission lookups in small, SECURITY DEFINER functions with search_path = public.
-- Because these functions bypass RLS during execution, policies invoking them never trigger infinite recursion.
create or replace function public.user_can_access_branch(_user_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branches b
    where b.id = _branch_id
      and (
        public.can_manage_business(_user_id, b.business_id)
        or exists (
          select 1
          from public.staff_members s
          join public.staff_branch_assignments a
            on a.staff_id = s.id and a.business_id = s.business_id
          where s.auth_user_id = _user_id
            and s.business_id = b.business_id
            and s.status = 'active'
            and a.branch_id = b.id
        )
      )
  );
$$;

create or replace function public.user_can_access_staff(_user_id uuid, _target_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members target
    where target.id = _target_staff_id
      and (
        public.can_manage_business(_user_id, target.business_id)
        or target.auth_user_id = _user_id
        or exists (
          select 1
          from public.staff_members me
          join public.staff_branch_assignments my_a
            on my_a.staff_id = me.id and my_a.business_id = me.business_id
          join public.staff_branch_assignments target_a
            on target_a.branch_id = my_a.branch_id and target_a.business_id = me.business_id
          where me.auth_user_id = _user_id
            and me.business_id = target.business_id
            and me.status = 'active'
            and target_a.staff_id = target.id
        )
      )
  );
$$;

create or replace function public.user_can_access_branch_assignment(_user_id uuid, _business_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_business(_user_id, _business_id)
    or public.user_can_access_branch(_user_id, _branch_id);
$$;

revoke all on function public.user_can_access_branch(uuid, uuid) from public;
revoke all on function public.user_can_access_staff(uuid, uuid) from public;
revoke all on function public.user_can_access_branch_assignment(uuid, uuid, uuid) from public;

grant execute on function public.user_can_access_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_branch_assignment(uuid, uuid, uuid) to authenticated, service_role;

-- Hardened RLS policies (Zero recursion, strict manager & cashier isolation)
drop policy if exists "members read business branches" on public.branches;
drop policy if exists "authorized members read business branches" on public.branches;
create policy "authorized members read business branches"
on public.branches for select to authenticated
using (public.user_can_access_branch(auth.uid(), id));

drop policy if exists "members read branch assignments" on public.staff_branch_assignments;
drop policy if exists "authorized members read branch assignments" on public.staff_branch_assignments;
create policy "authorized members read branch assignments"
on public.staff_branch_assignments for select to authenticated
using (public.user_can_access_branch_assignment(auth.uid(), business_id, branch_id));

drop policy if exists "members read business staff" on public.staff_members;
drop policy if exists "authorized members read business staff" on public.staff_members;
create policy "authorized members read business staff"
on public.staff_members for select to authenticated
using (public.user_can_access_staff(auth.uid(), id));

-- 1. Safe PIN-configured status projection
-- Does not return pin_hash, secret tokens, or throttle records.
-- Restricted to Owner/Admin and active Managers for branches they manage.
-- Denies Cashiers and cross-business callers.
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
-- Revoked from public, anon, and authenticated; granted only to service_role.
-- Called by security definer operations functions. Internal defense-in-depth authorization check included.
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

-- 3. Enhance operations_upsert_branch to safely auto-generate internal code when omitted
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

commit;

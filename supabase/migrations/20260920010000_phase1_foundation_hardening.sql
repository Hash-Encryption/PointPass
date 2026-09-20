begin;

-- ============================================================================
-- 1. SECURITY DEFINER AUTHORIZATION HELPERS (ANTI-RECURSION ARCHITECTURE)
-- ============================================================================
-- Centralize permission lookups in small, SECURITY DEFINER functions with
-- search_path = public. Because these functions bypass RLS during execution,
-- policies invoking them never trigger infinite recursion.

-- Helper 1: Can the user access (view) a specific branch?
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

-- Helper 2: Can the user access (view) a specific staff member?
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

-- Helper 3: Can the user access (view) an assignment for a given branch?
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

-- Helper 4: Can the user access (view) a cashier session?
create or replace function public.user_can_access_session(_user_id uuid, _business_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_business(_user_id, _business_id)
    or (
      _branch_id is not null
      and public.can_manage_branch(_user_id, _branch_id)
    );
$$;

-- Helper 5: Can the user access (view) a transaction?
create or replace function public.user_can_access_transaction(_user_id uuid, _business_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_business(_user_id, _business_id)
    or (
      _branch_id is not null
      and public.can_manage_branch(_user_id, _branch_id)
    );
$$;

revoke all on function public.user_can_access_branch(uuid, uuid) from public;
revoke all on function public.user_can_access_staff(uuid, uuid) from public;
revoke all on function public.user_can_access_branch_assignment(uuid, uuid, uuid) from public;
revoke all on function public.user_can_access_session(uuid, uuid, uuid) from public;
revoke all on function public.user_can_access_transaction(uuid, uuid, uuid) from public;

grant execute on function public.user_can_access_branch(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_branch_assignment(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_session(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.user_can_access_transaction(uuid, uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 2. HARDENED RLS POLICIES (ZERO RECURSION, STRICT MANAGER & CASHIER ISOLATION)
-- ============================================================================

-- branches
drop policy if exists "members read business branches" on public.branches;
drop policy if exists "authorized members read business branches" on public.branches;
create policy "authorized members read business branches"
on public.branches for select to authenticated
using (public.user_can_access_branch(auth.uid(), id));

-- staff_branch_assignments
drop policy if exists "members read branch assignments" on public.staff_branch_assignments;
drop policy if exists "authorized members read branch assignments" on public.staff_branch_assignments;
create policy "authorized members read branch assignments"
on public.staff_branch_assignments for select to authenticated
using (public.user_can_access_branch_assignment(auth.uid(), business_id, branch_id));

-- staff_members
drop policy if exists "members read business staff" on public.staff_members;
drop policy if exists "authorized members read business staff" on public.staff_members;
create policy "authorized members read business staff"
on public.staff_members for select to authenticated
using (public.user_can_access_staff(auth.uid(), id));

-- cashier_sessions
drop policy if exists "authorized managers read cashier sessions" on public.cashier_sessions;
create policy "authorized managers read cashier sessions"
on public.cashier_sessions for select to authenticated
using (public.user_can_access_session(auth.uid(), business_id, branch_id));

-- pass_transactions
drop policy if exists "members read business transactions" on public.pass_transactions;
drop policy if exists "authorized members read transactions" on public.pass_transactions;
create policy "authorized members read transactions"
on public.pass_transactions for select to authenticated
using (public.user_can_access_transaction(auth.uid(), business_id, branch_id));

-- ============================================================================
-- 3. AUTHORITATIVE BACKEND RESTRICTION ON NEW STAFF ROLE CREATION
-- ============================================================================
-- Prevents creating fresh 'owner', 'admin', or 'staff' records via direct RPC.
-- Preserves existing legacy records safely, allowing safe edits while prohibiting
-- direct transitions into deprecated legacy roles.
create or replace function public.operations_upsert_staff(
  _business_id uuid,
  _staff_id uuid,
  _code text,
  _name_ar text,
  _name_en text,
  _email text,
  _role text,
  _status text default 'active',
  _pin text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  _id uuid;
  _auth_user_id uuid;
  _clean_code text := lower(trim(_code));
  _clean_email text := nullif(lower(trim(_email)), '');
  _previous public.staff_members%rowtype;
  _owner_id uuid;
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Staff management denied';
  end if;

  if _clean_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or length(trim(_name_ar)) not between 2 and 120
    or length(trim(_name_en)) not between 2 and 120
    or _role not in ('owner', 'admin', 'manager', 'staff', 'cashier')
    or _status not in ('active', 'inactive')
    or (_pin is not null and _pin !~ '^[0-9]{4}$') then
    raise exception 'Invalid staff details';
  end if;

  select u.id into _auth_user_id
  from auth.users u
  where _clean_email is not null and lower(u.email) = _clean_email
  limit 1;

  select b.owner_id into _owner_id from public.businesses b where b.id = _business_id;
  if _role = 'owner' and _auth_user_id is distinct from _owner_id then
    raise exception 'Owner role must match the business owner account';
  end if;

  if _staff_id is null then
    -- Authoritative backend restriction: NEW staff creation only allows manager or cashier
    if _role not in ('manager', 'cashier') then
      raise exception 'New staff members can only be created with manager or cashier roles';
    end if;

    insert into public.staff_members (
      business_id, auth_user_id, code, name_ar, name_en, email, role, status
    ) values (
      _business_id, _auth_user_id, _clean_code, trim(_name_ar), trim(_name_en),
      _clean_email, _role, _status
    ) returning id into _id;
  else
    select * into _previous
    from public.staff_members s
    where s.id = _staff_id and s.business_id = _business_id
    for update;
    if not found then raise exception 'Staff member not found'; end if;

    -- If the role is being changed, it MUST be transitioned to 'manager' or 'cashier'.
    -- Legacy roles ('owner', 'admin', 'staff') can be preserved as-is, but cannot be freshly assigned or swapped.
    if _role is distinct from _previous.role and _role not in ('manager', 'cashier') then
      raise exception 'Role can only be transitioned to manager or cashier';
    end if;

    update public.staff_members
    set auth_user_id = _auth_user_id,
        code = _clean_code,
        name_ar = trim(_name_ar),
        name_en = trim(_name_en),
        email = _clean_email,
        role = _role,
        status = _status,
        updated_at = now()
    where id = _staff_id
    returning id into _id;

    if _previous.role is distinct from _role
      or _previous.status is distinct from _status
      or _previous.auth_user_id is distinct from _auth_user_id then
      update public.cashier_sessions
      set revoked_at = coalesce(revoked_at, now()), revoked_by = auth.uid()
      where staff_id = _id and revoked_at is null;
    end if;
  end if;

  if _pin is not null then
    insert into public.staff_cashier_credentials (staff_id, business_id, pin_hash, updated_at)
    values (_id, _business_id, extensions.crypt(_pin, extensions.gen_salt('bf', 10)), now())
    on conflict (staff_id) do update
    set pin_hash = excluded.pin_hash, updated_at = excluded.updated_at;

    delete from public.staff_cashier_auth_throttle where staff_id = _id;
    update public.cashier_sessions
    set revoked_at = coalesce(revoked_at, now()), revoked_by = auth.uid()
    where staff_id = _id and revoked_at is null;
  end if;

  return _id;
end;
$$;

commit;

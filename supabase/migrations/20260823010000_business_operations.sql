begin;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_ar text not null check (length(trim(name_ar)) between 2 and 120),
  name_en text not null check (length(trim(name_en)) between 2 and 120),
  address_ar text,
  address_en text,
  phone text,
  latitude double precision,
  longitude double precision,
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index branches_business_code_unique
  on public.branches (business_id, lower(code));

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  code text not null check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_ar text not null check (length(trim(name_ar)) between 2 and 120),
  name_en text not null check (length(trim(name_en)) between 2 and 120),
  email text,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff', 'cashier')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index staff_members_business_code_unique
  on public.staff_members (business_id, lower(code));
create unique index staff_members_business_auth_user_unique
  on public.staff_members (business_id, auth_user_id)
  where auth_user_id is not null;
create unique index staff_members_business_email_unique
  on public.staff_members (business_id, lower(email))
  where email is not null;

create table public.staff_branch_assignments (
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null,
  branch_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (staff_id, branch_id),
  foreign key (staff_id, business_id)
    references public.staff_members(id, business_id) on delete cascade,
  foreign key (branch_id, business_id)
    references public.branches(id, business_id) on delete cascade
);

create table public.staff_cashier_credentials (
  staff_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  foreign key (staff_id, business_id)
    references public.staff_members(id, business_id) on delete cascade
);

create table public.staff_cashier_auth_throttle (
  staff_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  failed_attempts integer not null default 0,
  window_started_at timestamptz,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (staff_id, business_id)
    references public.staff_members(id, business_id) on delete cascade
);

alter table public.cashier_sessions
  add column branch_id uuid,
  add column staff_id uuid,
  add column device_name text,
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null;

alter table public.cashier_sessions
  add constraint cashier_sessions_staff_business_fkey
    foreign key (staff_id, business_id)
    references public.staff_members(id, business_id),
  add constraint cashier_sessions_branch_business_fkey
    foreign key (branch_id, business_id)
    references public.branches(id, business_id),
  add constraint cashier_sessions_device_name_length
    check (device_name is null or length(device_name) <= 120);

create index cashier_sessions_business_active_idx
  on public.cashier_sessions (business_id, expires_at)
  where revoked_at is null;

alter table public.pass_transactions
  add column branch_id uuid references public.branches(id) on delete set null,
  add column staff_id uuid references public.staff_members(id) on delete set null,
  add column cashier_session_id uuid references public.cashier_sessions(id) on delete set null,
  add column cashier_device_name text;

-- Existing businesses have no truthful historical location. Do not invent default branches.
-- Legacy business-level cashier sessions remain valid with nullable staff/branch attribution.

create or replace function public.can_access_business(_user_id uuid, _business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1 from public.businesses b
      where b.id = _business_id and b.owner_id = _user_id
    )
    or exists (
      select 1 from public.user_roles r
      where r.user_id = _user_id
        and r.business_id = _business_id
        and r.role in ('merchant', 'cashier')
    )
    or exists (
      select 1 from public.staff_members s
      where s.auth_user_id = _user_id
        and s.business_id = _business_id
        and s.status = 'active'
    )
$$;

create or replace function public.can_manage_business(_user_id uuid, _business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1 from public.businesses b
      where b.id = _business_id and b.owner_id = _user_id
    )
    or exists (
      select 1 from public.user_roles r
      where r.user_id = _user_id
        and r.business_id = _business_id
        and r.role = 'merchant'
    )
    or exists (
      select 1 from public.staff_members s
      where s.auth_user_id = _user_id
        and s.business_id = _business_id
        and s.status = 'active'
        and s.role in ('owner', 'admin')
    )
$$;

create or replace function public.can_manage_branch(_user_id uuid, _branch_id uuid)
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
            and s.role = 'manager'
            and s.status = 'active'
            and a.branch_id = b.id
        )
      )
  )
$$;

alter table public.branches enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_branch_assignments enable row level security;
alter table public.staff_cashier_credentials enable row level security;
alter table public.staff_cashier_auth_throttle enable row level security;

grant select, insert, update on public.branches to authenticated;
grant select on public.staff_members, public.staff_branch_assignments to authenticated;
grant select on public.cashier_sessions to authenticated;
grant all on public.branches, public.staff_members, public.staff_branch_assignments,
  public.staff_cashier_credentials, public.staff_cashier_auth_throttle to service_role;

revoke all on public.staff_cashier_credentials, public.staff_cashier_auth_throttle
  from public, anon, authenticated;

create policy "members read business branches"
on public.branches for select to authenticated
using (public.can_access_business(auth.uid(), business_id));

create policy "authorized managers create branches"
on public.branches for insert to authenticated
with check (public.can_manage_business(auth.uid(), business_id));

create policy "authorized managers update branches"
on public.branches for update to authenticated
using (public.can_manage_branch(auth.uid(), id))
with check (public.can_manage_branch(auth.uid(), id));

create policy "members read business staff"
on public.staff_members for select to authenticated
using (public.can_access_business(auth.uid(), business_id));

create policy "members read branch assignments"
on public.staff_branch_assignments for select to authenticated
using (public.can_access_business(auth.uid(), business_id));

create policy "authorized managers read cashier sessions"
on public.cashier_sessions for select to authenticated
using (
  public.can_manage_business(auth.uid(), business_id)
  or (branch_id is not null and public.can_manage_branch(auth.uid(), branch_id))
);

create or replace function public.operations_access(_business_id uuid)
returns table (operational_role text, can_manage boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_access_business(auth.uid(), _business_id) then
    raise exception 'Business access denied';
  end if;

  return query
  select
    case
      when public.can_manage_business(auth.uid(), _business_id)
        and not exists (
          select 1 from public.staff_members s
          where s.auth_user_id = auth.uid() and s.business_id = _business_id
        ) then 'owner'
      else coalesce((
        select s.role from public.staff_members s
        where s.auth_user_id = auth.uid()
          and s.business_id = _business_id
          and s.status = 'active'
        limit 1
      ), 'staff')
    end,
    public.can_manage_business(auth.uid(), _business_id);
end;
$$;

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
begin
  if _branch_id is null then
    if not public.can_manage_business(auth.uid(), _business_id) then
      raise exception 'Branch creation denied';
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

create or replace function public.operations_assign_staff(
  _business_id uuid,
  _staff_id uuid,
  _branch_id uuid,
  _assigned boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_business(auth.uid(), _business_id) then
    raise exception 'Branch assignment denied';
  end if;

  if not exists (
    select 1 from public.staff_members s
    where s.id = _staff_id and s.business_id = _business_id
  ) or not exists (
    select 1 from public.branches b
    where b.id = _branch_id and b.business_id = _business_id
  ) then
    raise exception 'Staff and branch must belong to the requested business';
  end if;

  if _assigned then
    insert into public.staff_branch_assignments (business_id, staff_id, branch_id, assigned_by)
    values (_business_id, _staff_id, _branch_id, auth.uid())
    on conflict (staff_id, branch_id) do nothing;
  else
    delete from public.staff_branch_assignments
    where business_id = _business_id and staff_id = _staff_id and branch_id = _branch_id;
    update public.cashier_sessions
    set revoked_at = coalesce(revoked_at, now()), revoked_by = auth.uid()
    where staff_id = _staff_id and branch_id = _branch_id and revoked_at is null;
  end if;
end;
$$;

create or replace function public.operations_revoke_session(
  _business_id uuid,
  _session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _branch_id uuid;
begin
  select s.branch_id into _branch_id
  from public.cashier_sessions s
  where s.id = _session_id and s.business_id = _business_id;

  if not found or not (
    public.can_manage_business(auth.uid(), _business_id)
    or (_branch_id is not null and public.can_manage_branch(auth.uid(), _branch_id))
  ) then
    raise exception 'Session revocation denied';
  end if;

  update public.cashier_sessions
  set revoked_at = coalesce(revoked_at, now()), revoked_by = auth.uid()
  where id = _session_id and business_id = _business_id;
end;
$$;

create or replace function public.link_staff_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email is not null then
    update public.staff_members
    set auth_user_id = new.id, updated_at = now()
    where auth_user_id is null and lower(email) = lower(trim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists pointpass_link_staff_auth on auth.users;
create trigger pointpass_link_staff_auth
after insert or update of email on auth.users
for each row execute function public.link_staff_auth_user();

create or replace function public.cashier_unlock_staff(
  _slug text,
  _branch_code text,
  _staff_code text,
  _pin text,
  _device_name text default null
)
returns table (
  business_id uuid,
  business_slug text,
  name_ar text,
  name_en text,
  branch_id uuid,
  branch_name_ar text,
  branch_name_en text,
  staff_id uuid,
  staff_name_ar text,
  staff_name_en text,
  cashier_session text,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _unlock record;
  _throttle public.staff_cashier_auth_throttle%rowtype;
  _session_token text;
  _expires_at timestamptz := now() + interval '30 minutes';
begin
  select b.id as business_id, b.slug, b.name_ar as business_name_ar,
    b.name_en as business_name_en, br.id as branch_id,
    br.name_ar as branch_name_ar, br.name_en as branch_name_en,
    s.id as staff_id, s.name_ar as staff_name_ar, s.name_en as staff_name_en,
    c.pin_hash
  into _unlock
  from public.businesses b
  join public.branches br on br.business_id = b.id and br.status = 'active'
  join public.staff_members s on s.business_id = b.id and s.status = 'active'
  join public.staff_branch_assignments a
    on a.business_id = b.id and a.branch_id = br.id and a.staff_id = s.id
  join public.staff_cashier_credentials c
    on c.business_id = b.id and c.staff_id = s.id
  where b.slug = lower(trim(_slug)) and b.status = 'active'
    and lower(br.code) = lower(trim(_branch_code))
    and lower(s.code) = lower(trim(_staff_code))
  limit 1;

  if not found then return; end if;

  insert into public.staff_cashier_auth_throttle (staff_id, business_id)
  values (_unlock.staff_id, _unlock.business_id)
  on conflict (staff_id) do nothing;

  select * into _throttle
  from public.staff_cashier_auth_throttle t
  where t.staff_id = _unlock.staff_id
  for update;

  if _throttle.blocked_until > now() then return; end if;
  if _throttle.window_started_at is null
    or _throttle.window_started_at <= now() - interval '5 minutes' then
    _throttle.failed_attempts := 0;
    _throttle.window_started_at := now();
  end if;

  if coalesce(_pin, '') !~ '^[0-9]{4}$'
    or extensions.crypt(_pin, _unlock.pin_hash) <> _unlock.pin_hash then
    _throttle.failed_attempts := _throttle.failed_attempts + 1;
    update public.staff_cashier_auth_throttle
    set failed_attempts = _throttle.failed_attempts,
        window_started_at = _throttle.window_started_at,
        blocked_until = case when _throttle.failed_attempts >= 5
          then now() + interval '5 minutes' else null end,
        updated_at = now()
    where staff_id = _unlock.staff_id;
    return;
  end if;

  update public.staff_cashier_auth_throttle
  set failed_attempts = 0, window_started_at = null,
      blocked_until = null, updated_at = now()
  where staff_id = _unlock.staff_id;

  _session_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.cashier_sessions (
    business_id, branch_id, staff_id, token_hash, device_name, expires_at
  ) values (
    _unlock.business_id, _unlock.branch_id, _unlock.staff_id,
    extensions.digest(_session_token, 'sha256'),
    left(nullif(trim(_device_name), ''), 120), _expires_at
  );

  return query select
    _unlock.business_id, _unlock.slug, _unlock.business_name_ar,
    _unlock.business_name_en, _unlock.branch_id, _unlock.branch_name_ar,
    _unlock.branch_name_en, _unlock.staff_id, _unlock.staff_name_ar,
    _unlock.staff_name_en, _session_token, _expires_at;
end;
$$;

create or replace function public.cashier_apply_action(
  _slug text,
  _session_token text,
  _serial text,
  _action text,
  _amount_sar numeric default null
)
returns table (
  wallet_serial text,
  pass_serial text,
  pass_program_type public.program_type,
  pass_stamps integer,
  pass_points integer,
  pass_morphed boolean,
  business_name text,
  business_offer text,
  business_target_stamps integer,
  business_sar_per_point integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _business public.businesses%rowtype;
  _authorization record;
  _pass public.pass_instances%rowtype;
  _earned_points integer := 0;
  _stamp_delta integer := 0;
  _points_delta integer := 0;
  _morph_applied boolean := false;
  _next_stamps integer;
  _next_points integer;
  _next_morphed boolean;
begin
  if _action not in ('stamp', 'points', 'redeem') then
    raise exception 'Unsupported loyalty action';
  end if;
  if _action = 'points' and (
    _amount_sar is null or _amount_sar <= 0 or _amount_sar > 100000
    or _amount_sar::text in ('NaN', 'Infinity', '-Infinity')
  ) then raise exception 'A valid positive SAR amount is required'; end if;
  if _action <> 'points' and _amount_sar is not null then
    raise exception 'SAR amount is only accepted for points earning';
  end if;

  select b, s.id as session_id, s.staff_id, s.branch_id, s.device_name
  into _authorization
  from public.cashier_sessions s
  join public.businesses b on b.id = s.business_id
  where s.token_hash = extensions.digest(coalesce(_session_token, ''), 'sha256')
    and s.expires_at > now() and s.revoked_at is null
    and b.slug = lower(trim(_slug)) and b.status = 'active'
  for update of s;

  if not found then raise exception 'Cashier session invalid or expired'; end if;
  _business := _authorization.b;

  if _authorization.staff_id is not null and (
    _authorization.branch_id is null or not exists (
      select 1
      from public.staff_members sm
      join public.branches br
        on br.id = _authorization.branch_id and br.business_id = sm.business_id
      join public.staff_branch_assignments a
        on a.business_id = sm.business_id and a.staff_id = sm.id and a.branch_id = br.id
      where sm.id = _authorization.staff_id
        and sm.business_id = _business.id
        and sm.status = 'active' and br.status = 'active'
    )
  ) then raise exception 'Cashier session invalid or expired'; end if;

  update public.cashier_sessions set last_used_at = now()
  where id = _authorization.session_id;

  select p.* into _pass from public.pass_instances p
  where p.serial = trim(_serial) and p.business_id = _business.id for update;
  if not found then raise exception 'Pass does not belong to this business'; end if;
  if _pass.stamps < 0 or _pass.points < 0 then
    raise exception 'Pass has invalid historical loyalty balance';
  end if;
  if _pass.morphed and _pass.program_type <> 'coupon_morph' then
    raise exception 'Pass has invalid historical morph state';
  end if;

  case _pass.program_type
    when 'stamp' then
      if _action not in ('stamp', 'redeem') then raise exception 'Action is not valid for a stamp program'; end if;
      if _business.target_stamps is null or _business.target_stamps <= 0 then raise exception 'Business stamp target is invalid'; end if;
      if _action = 'stamp' then _stamp_delta := 1;
      elsif _pass.stamps < _business.target_stamps then raise exception 'Insufficient stamps for reward redemption';
      else _stamp_delta := -_business.target_stamps; end if;
    when 'points' then
      if _action not in ('points', 'redeem') then raise exception 'Action is not valid for a points program'; end if;
      if _action = 'points' then
        if _business.sar_per_point is null or _business.sar_per_point <= 0 then raise exception 'Business points earn rate is invalid'; end if;
        _earned_points := floor(_amount_sar / _business.sar_per_point)::integer;
        _points_delta := _earned_points;
      else
        if _business.points_per_reward <= 0 then raise exception 'Business points reward threshold is invalid'; end if;
        if _pass.points < _business.points_per_reward then raise exception 'Insufficient points for reward redemption'; end if;
        _points_delta := -_business.points_per_reward;
      end if;
    when 'coupon_morph' then
      if not _pass.morphed then
        if _action <> 'redeem' then raise exception 'Introductory coupon must be redeemed before loyalty earning'; end if;
        if _business.target_stamps is null or _business.target_stamps <= 0 then raise exception 'Business stamp target is invalid'; end if;
        _morph_applied := true;
      else
        if _action not in ('stamp', 'redeem') then raise exception 'Morphed coupon pass uses stamp actions'; end if;
        if _business.target_stamps is null or _business.target_stamps <= 0 then raise exception 'Business stamp target is invalid'; end if;
        if _action = 'stamp' then _stamp_delta := 1;
        elsif _pass.stamps < _business.target_stamps then raise exception 'Insufficient stamps for reward redemption';
        else _stamp_delta := -_business.target_stamps; end if;
      end if;
  end case;

  _next_stamps := _pass.stamps + _stamp_delta;
  _next_points := _pass.points + _points_delta;
  _next_morphed := _pass.morphed or _morph_applied;
  if _next_stamps < 0 or _next_points < 0 then raise exception 'Loyalty operation would create a negative balance'; end if;

  update public.pass_instances
  set stamps = _next_stamps, points = _next_points,
      morphed = _next_morphed, last_visit_at = now()
  where id = _pass.id;

  insert into public.pass_transactions (
    pass_serial, business_id, action, amount_sar, program_type,
    stamp_delta, points_delta, morph_applied, stamps_after,
    points_after, morphed_after, branch_id, staff_id,
    cashier_session_id, cashier_device_name
  ) values (
    _pass.serial, _business.id, _action,
    case when _action = 'points' then _amount_sar else null end,
    _pass.program_type, _stamp_delta, _points_delta, _morph_applied,
    _next_stamps, _next_points, _next_morphed,
    _authorization.branch_id, _authorization.staff_id,
    _authorization.session_id, _authorization.device_name
  );

  return query select p.wallet_serial, p.serial, p.program_type,
    p.stamps, p.points, p.morphed, _business.name_en,
    coalesce(_business.offer_en, ''), coalesce(_business.target_stamps, 9),
    coalesce(_business.sar_per_point, 10)
  from public.pass_instances p where p.id = _pass.id;
end;
$$;

revoke all on function public.operations_access(uuid) from public;
revoke all on function public.operations_upsert_branch(uuid, uuid, text, text, text, text, text, text) from public;
revoke all on function public.operations_upsert_staff(uuid, uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.operations_assign_staff(uuid, uuid, uuid, boolean) from public;
revoke all on function public.operations_revoke_session(uuid, uuid) from public;
revoke all on function public.cashier_unlock_staff(text, text, text, text, text) from public;
revoke all on function public.cashier_apply_action(text, text, text, text, numeric) from public;

grant execute on function public.operations_access(uuid),
  public.operations_upsert_branch(uuid, uuid, text, text, text, text, text, text),
  public.operations_upsert_staff(uuid, uuid, text, text, text, text, text, text, text),
  public.operations_assign_staff(uuid, uuid, uuid, boolean),
  public.operations_revoke_session(uuid, uuid) to authenticated;
grant execute on function public.cashier_unlock_staff(text, text, text, text, text),
  public.cashier_apply_action(text, text, text, text, numeric) to anon, authenticated;

commit;

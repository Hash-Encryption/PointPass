begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if exists (
    select 1
    from public.businesses
    where cashier_pin is not null
      and cashier_pin !~ '^[0-9]{4}$'
  ) then
    raise exception 'Malformed cashier PIN data found; migration aborted';
  end if;
end $$;

create table public.cashier_credentials (
  business_id uuid primary key
    references public.businesses(id) on delete cascade
    deferrable initially deferred,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.cashier_auth_throttle (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  failed_attempts integer not null default 0,
  window_started_at timestamptz,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.cashier_credentials enable row level security;
alter table public.cashier_auth_throttle enable row level security;
alter table public.cashier_sessions enable row level security;

revoke all on public.cashier_credentials from public, anon, authenticated;
revoke all on public.cashier_auth_throttle from public, anon, authenticated;
revoke all on public.cashier_sessions from public, anon, authenticated;
grant all on public.cashier_credentials to service_role;
grant all on public.cashier_auth_throttle to service_role;
grant all on public.cashier_sessions to service_role;

insert into public.cashier_credentials (business_id, pin_hash)
select id, extensions.crypt(cashier_pin, extensions.gen_salt('bf', 10))
from public.businesses
where cashier_pin is not null;

update public.businesses
set cashier_pin = null
where cashier_pin is not null;

alter table public.businesses
  add constraint businesses_cashier_pin_write_only
  check (cashier_pin is null);

create or replace function public.store_cashier_pin()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.cashier_pin is null then
    return new;
  end if;

  if new.cashier_pin !~ '^[0-9]{4}$' then
    raise exception 'Cashier PIN must contain exactly four digits';
  end if;

  insert into public.cashier_credentials (business_id, pin_hash, updated_at)
  values (
    new.id,
    extensions.crypt(new.cashier_pin, extensions.gen_salt('bf', 10)),
    now()
  )
  on conflict (business_id) do update
  set pin_hash = excluded.pin_hash,
      updated_at = excluded.updated_at;

  delete from public.cashier_sessions where business_id = new.id;
  delete from public.cashier_auth_throttle where business_id = new.id;
  new.cashier_pin := null;
  return new;
end;
$$;

revoke all on function public.store_cashier_pin() from public;

drop trigger if exists store_cashier_pin on public.businesses;
create trigger store_cashier_pin
before insert or update of cashier_pin on public.businesses
for each row execute function public.store_cashier_pin();

drop function if exists public.cashier_unlock(text, text);

create function public.cashier_unlock(_slug text, _pin text)
returns table (
  business_id uuid,
  business_slug text,
  name_ar text,
  name_en text,
  cashier_session text,
  session_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _business public.businesses%rowtype;
  _unlock record;
  _pin_hash text;
  _throttle public.cashier_auth_throttle%rowtype;
  _session_token text;
  _expires_at timestamptz := now() + interval '30 minutes';
begin
  select b, c.pin_hash
  into _unlock
  from public.businesses b
  join public.cashier_credentials c on c.business_id = b.id
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
  limit 1;

  if not found then
    return;
  end if;

  _business := _unlock.b;
  _pin_hash := _unlock.pin_hash;

  insert into public.cashier_auth_throttle (business_id)
  values (_business.id)
  on conflict on constraint cashier_auth_throttle_pkey do nothing;

  select * into _throttle
  from public.cashier_auth_throttle t
  where t.business_id = _business.id
  for update of t;

  if _throttle.blocked_until > now() then
    return;
  end if;

  if _throttle.window_started_at is null
    or _throttle.window_started_at <= now() - interval '5 minutes'
  then
    _throttle.failed_attempts := 0;
    _throttle.window_started_at := now();
    _throttle.blocked_until := null;
  end if;

  if _pin !~ '^[0-9]{4}$'
    or extensions.crypt(_pin, _pin_hash) <> _pin_hash
  then
    _throttle.failed_attempts := _throttle.failed_attempts + 1;

    update public.cashier_auth_throttle t
    set failed_attempts = _throttle.failed_attempts,
        window_started_at = _throttle.window_started_at,
        blocked_until = case
          when _throttle.failed_attempts >= 5 then now() + interval '5 minutes'
          else null
        end,
        updated_at = now()
    where t.business_id = _business.id;

    return;
  end if;

  update public.cashier_auth_throttle t
  set failed_attempts = 0,
      window_started_at = null,
      blocked_until = null,
      updated_at = now()
  where t.business_id = _business.id;

  delete from public.cashier_sessions s
  where s.business_id = _business.id
    and s.expires_at <= now();

  _session_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.cashier_sessions (business_id, token_hash, expires_at)
  values (
    _business.id,
    extensions.digest(_session_token, 'sha256'),
    _expires_at
  );

  return query select
    _business.id,
    _business.slug,
    _business.name_ar,
    _business.name_en,
    _session_token,
    _expires_at;
end;
$$;

revoke all on function public.cashier_unlock(text, text) from public;
grant execute on function public.cashier_unlock(text, text) to anon, authenticated;

drop function if exists public.cashier_apply_action(text, text, text, text, numeric);

create function public.cashier_apply_action(
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
  _session_id uuid;
  _earned_points integer := 0;
begin
  if _action not in ('stamp', 'points', 'redeem') then
    raise exception 'Unsupported loyalty action';
  end if;

  if _action = 'points' and coalesce(_amount_sar, 0) <= 0 then
    raise exception 'A positive SAR amount is required';
  end if;

  select b, s.id
  into _authorization
  from public.cashier_sessions s
  join public.businesses b on b.id = s.business_id
  where s.token_hash = extensions.digest(coalesce(_session_token, ''), 'sha256')
    and s.expires_at > now()
    and b.slug = lower(trim(_slug))
    and b.status = 'active'
  for update of s;

  if not found then
    raise exception 'Cashier session invalid or expired';
  end if;

  _business := _authorization.b;
  _session_id := _authorization.id;

  update public.cashier_sessions
  set last_used_at = now()
  where id = _session_id;

  select p.* into _pass
  from public.pass_instances p
  where p.serial = trim(_serial)
    and p.business_id = _business.id
  for update;

  if not found then
    raise exception 'Pass does not belong to this business';
  end if;

  if _action = 'points' then
    _earned_points := floor(
      _amount_sar / greatest(coalesce(_business.sar_per_point, 10), 1)
    )::integer;
  end if;

  update public.pass_instances
  set
    stamps = case when _action = 'stamp' then stamps + 1 else stamps end,
    points = case when _action = 'points' then points + _earned_points else points end,
    morphed = case when program_type = 'coupon_morph' then true else morphed end,
    last_visit_at = now()
  where id = _pass.id;

  insert into public.pass_transactions (pass_serial, business_id, action, amount_sar)
  values (
    _pass.serial,
    _business.id,
    _action,
    case when _action = 'points' then _amount_sar else null end
  );

  return query
  select
    p.wallet_serial,
    p.serial,
    p.program_type,
    p.stamps,
    p.points,
    p.morphed,
    _business.name_en,
    coalesce(_business.offer_en, ''),
    coalesce(_business.target_stamps, 9),
    coalesce(_business.sar_per_point, 10)
  from public.pass_instances p
  where p.id = _pass.id;
end;
$$;

revoke all on function public.cashier_apply_action(text, text, text, text, numeric) from public;
grant execute on function public.cashier_apply_action(text, text, text, text, numeric)
to anon, authenticated;

commit;

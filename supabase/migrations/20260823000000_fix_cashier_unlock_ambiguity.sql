begin;

create or replace function public.cashier_unlock(_slug text, _pin text)
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

commit;

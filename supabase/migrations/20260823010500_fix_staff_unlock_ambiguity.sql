begin;

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
  on conflict on constraint staff_cashier_auth_throttle_pkey do nothing;

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
    update public.staff_cashier_auth_throttle t
    set failed_attempts = _throttle.failed_attempts,
        window_started_at = _throttle.window_started_at,
        blocked_until = case when _throttle.failed_attempts >= 5
          then now() + interval '5 minutes' else null end,
        updated_at = now()
    where t.staff_id = _unlock.staff_id;
    return;
  end if;

  update public.staff_cashier_auth_throttle t
  set failed_attempts = 0, window_started_at = null,
      blocked_until = null, updated_at = now()
  where t.staff_id = _unlock.staff_id;

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

revoke all on function public.cashier_unlock_staff(text, text, text, text, text) from public;
grant execute on function public.cashier_unlock_staff(text, text, text, text, text)
to anon, authenticated;

commit;

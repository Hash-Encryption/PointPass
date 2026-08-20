begin;

alter table public.businesses alter column cashier_pin drop default;
alter table public.pass_instances add column if not exists wallet_serial text;
create unique index if not exists pass_instances_wallet_serial_unique
  on public.pass_instances (wallet_serial)
  where wallet_serial is not null;

-- Public visitors get a deliberately narrow business payload through an RPC.
drop policy if exists "public can read businesses" on public.businesses;
revoke all on public.businesses from anon;

create or replace function public.get_public_business_by_slug(_slug text)
returns table (
  slug text,
  name_ar text,
  name_en text,
  logo_url text,
  brand_color text,
  accent_color text,
  program_type public.program_type,
  offer_ar text,
  offer_en text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.slug,
    b.name_ar,
    b.name_en,
    b.logo_url,
    b.brand_color,
    b.accent_color,
    b.program_type,
    coalesce(b.offer_ar, ''),
    coalesce(b.offer_en, '')
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
  limit 1
$$;

revoke all on function public.get_public_business_by_slug(text) from public;
grant execute on function public.get_public_business_by_slug(text) to anon, authenticated;

-- Claims are created atomically after validating that the business is active.
create or replace function public.claim_public_pass(_slug text, _phone text)
returns table (
  pass_serial text,
  pass_program_type public.program_type,
  business_name text,
  business_offer text,
  business_target_stamps integer,
  business_sar_per_point integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _business public.businesses%rowtype;
begin
  if char_length(trim(_phone)) not between 6 and 20 then
    raise exception 'Phone identifier must contain 6 to 20 characters';
  end if;

  select b.* into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active';

  if not found then
    raise exception 'Business not found or inactive';
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
    trim(_phone),
    _business.program_type
  )
  returning
    pass_instances.serial,
    pass_instances.program_type,
    _business.name_en,
    coalesce(_business.offer_en, ''),
    coalesce(_business.target_stamps, 9),
    coalesce(_business.sar_per_point, 10);
end;
$$;

revoke all on function public.claim_public_pass(text, text) from public;
grant execute on function public.claim_public_pass(text, text) to anon, authenticated;

create or replace function public.attach_wallet_serial(_pass_serial text, _wallet_serial text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(_wallet_serial)) not between 1 and 128 then
    raise exception 'Invalid wallet serial';
  end if;

  update public.pass_instances
  set wallet_serial = trim(_wallet_serial)
  where serial = trim(_pass_serial)
    and wallet_serial is null;

  if not found then
    raise exception 'Pass not found or wallet already attached';
  end if;

  return true;
end;
$$;

revoke all on function public.attach_wallet_serial(text, text) from public;
grant execute on function public.attach_wallet_serial(text, text) to anon, authenticated;

-- The cashier PIN is checked in Postgres and is never returned to the browser.
create or replace function public.cashier_unlock(_slug text, _pin text)
returns table (
  business_id uuid,
  business_slug text,
  name_ar text,
  name_en text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.slug, b.name_ar, b.name_en
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
    and b.cashier_pin = _pin
    and _pin ~ '^[0-9]{4}$'
  limit 1
$$;

revoke all on function public.cashier_unlock(text, text) from public;
grant execute on function public.cashier_unlock(text, text) to anon, authenticated;

-- Record the local loyalty state and audit row before attempting wallet sync.
create or replace function public.cashier_apply_action(
  _slug text,
  _pin text,
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
set search_path = public
as $$
declare
  _business public.businesses%rowtype;
  _pass public.pass_instances%rowtype;
  _earned_points integer := 0;
begin
  if _action not in ('stamp', 'points', 'redeem') then
    raise exception 'Unsupported loyalty action';
  end if;

  if _action = 'points' and coalesce(_amount_sar, 0) <= 0 then
    raise exception 'A positive SAR amount is required';
  end if;

  select b.* into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
    and b.cashier_pin = _pin
    and _pin ~ '^[0-9]{4}$';

  if not found then
    raise exception 'Invalid business or cashier PIN';
  end if;

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

  insert into public.pass_transactions (
    pass_serial,
    business_id,
    action,
    amount_sar
  )
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

-- Direct anonymous writes bypassed business/PIN validation; RPCs above replace them.
drop policy if exists "anyone can claim a pass" on public.pass_instances;
drop policy if exists "cashier logs transactions" on public.pass_transactions;

revoke insert, update, delete on public.pass_instances from anon, authenticated;
revoke insert, update, delete on public.pass_transactions from anon, authenticated;

commit;

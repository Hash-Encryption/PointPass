begin;

alter table public.businesses
  add column if not exists points_per_reward integer not null default 100;

-- Preserve malformed historical rows, but reject future invalid configuration/state.
alter table public.businesses
  add constraint businesses_target_stamps_positive
  check (target_stamps is null or target_stamps > 0) not valid;

alter table public.businesses
  add constraint businesses_sar_per_point_positive
  check (sar_per_point is null or sar_per_point > 0) not valid;

alter table public.businesses
  add constraint businesses_points_per_reward_positive
  check (points_per_reward > 0) not valid;

alter table public.pass_instances
  add constraint pass_instances_nonnegative_balances
  check (stamps >= 0 and points >= 0) not valid;

alter table public.pass_instances
  add constraint pass_instances_valid_morph_state
  check (not morphed or program_type = 'coupon_morph') not valid;

-- Historical transactions stay unknown; Phase 2+ mutations always fill these fields.
alter table public.pass_transactions
  add column if not exists program_type public.program_type,
  add column if not exists stamp_delta integer,
  add column if not exists points_delta integer,
  add column if not exists morph_applied boolean,
  add column if not exists stamps_after integer,
  add column if not exists points_after integer,
  add column if not exists morphed_after boolean;

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
  _session_id uuid;
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
    _amount_sar is null
    or _amount_sar <= 0
    or _amount_sar > 100000
    or _amount_sar::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'A valid positive SAR amount is required';
  end if;

  if _action <> 'points' and _amount_sar is not null then
    raise exception 'SAR amount is only accepted for points earning';
  end if;

  -- Phase 1 authentication contract: keep this session-token authorization unchanged.
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

  if _pass.stamps < 0 or _pass.points < 0 then
    raise exception 'Pass has invalid historical loyalty balance';
  end if;

  if _pass.morphed and _pass.program_type <> 'coupon_morph' then
    raise exception 'Pass has invalid historical morph state';
  end if;

  case _pass.program_type
    when 'stamp' then
      if _action not in ('stamp', 'redeem') then
        raise exception 'Action is not valid for a stamp program';
      end if;
      if _business.target_stamps is null or _business.target_stamps <= 0 then
        raise exception 'Business stamp target is invalid';
      end if;
      if _action = 'stamp' then
        _stamp_delta := 1;
      elsif _pass.stamps < _business.target_stamps then
        raise exception 'Insufficient stamps for reward redemption';
      else
        _stamp_delta := -_business.target_stamps;
      end if;

    when 'points' then
      if _action not in ('points', 'redeem') then
        raise exception 'Action is not valid for a points program';
      end if;
      if _action = 'points' then
        if _business.sar_per_point is null or _business.sar_per_point <= 0 then
          raise exception 'Business points earn rate is invalid';
        end if;
        _earned_points := floor(_amount_sar / _business.sar_per_point)::integer;
        _points_delta := _earned_points;
      else
        if _business.points_per_reward <= 0 then
          raise exception 'Business points reward threshold is invalid';
        end if;
        if _pass.points < _business.points_per_reward then
          raise exception 'Insufficient points for reward redemption';
        end if;
        _points_delta := -_business.points_per_reward;
      end if;

    when 'coupon_morph' then
      if not _pass.morphed then
        if _action <> 'redeem' then
          raise exception 'Introductory coupon must be redeemed before loyalty earning';
        end if;
        if _business.target_stamps is null or _business.target_stamps <= 0 then
          raise exception 'Business stamp target is invalid';
        end if;
        _morph_applied := true;
      else
        if _action not in ('stamp', 'redeem') then
          raise exception 'Morphed coupon pass uses stamp actions';
        end if;
        if _business.target_stamps is null or _business.target_stamps <= 0 then
          raise exception 'Business stamp target is invalid';
        end if;
        if _action = 'stamp' then
          _stamp_delta := 1;
        elsif _pass.stamps < _business.target_stamps then
          raise exception 'Insufficient stamps for reward redemption';
        else
          _stamp_delta := -_business.target_stamps;
        end if;
      end if;
  end case;

  _next_stamps := _pass.stamps + _stamp_delta;
  _next_points := _pass.points + _points_delta;
  _next_morphed := _pass.morphed or _morph_applied;

  if _next_stamps < 0 or _next_points < 0 then
    raise exception 'Loyalty operation would create a negative balance';
  end if;

  update public.pass_instances
  set stamps = _next_stamps,
      points = _next_points,
      morphed = _next_morphed,
      last_visit_at = now()
  where id = _pass.id;

  insert into public.pass_transactions (
    pass_serial,
    business_id,
    action,
    amount_sar,
    program_type,
    stamp_delta,
    points_delta,
    morph_applied,
    stamps_after,
    points_after,
    morphed_after
  )
  values (
    _pass.serial,
    _business.id,
    _action,
    case when _action = 'points' then _amount_sar else null end,
    _pass.program_type,
    _stamp_delta,
    _points_delta,
    _morph_applied,
    _next_stamps,
    _next_points,
    _next_morphed
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

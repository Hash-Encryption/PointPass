begin;

-- Function: cashier_lookup_pass
-- Fast, read-only pass and customer lookup for cashier terminals
-- Allows PIN-authenticated cashier sessions to retrieve live pass stamps, target, offer, and customer details
-- without mutating loyalty balances.

create or replace function public.cashier_lookup_pass(
  _slug text,
  _query text,
  _session_token text default null
)
returns table (
  pass_serial text,
  program_type public.program_type,
  business_name text,
  business_offer text,
  business_target_stamps integer,
  business_sar_per_point integer,
  business_points_per_reward integer,
  pass_stamps integer,
  pass_points integer,
  pass_morphed boolean,
  pass_wallet_serial text,
  customer_phone text,
  customer_name text,
  rewards_redeemed integer,
  total_stamps integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _business public.businesses%rowtype;
  _clean_query text;
  _norm_phone text;
  _pass public.pass_instances%rowtype;
  _redeemed integer := 0;
  _total_stamps_issued integer := 0;
begin
  -- Resolve business by slug
  select * into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
  limit 1;

  if not found then
    return;
  end if;

  -- Optional session validation: if session token is provided, verify it is valid
  if _session_token is not null and _session_token <> '' then
    if not exists (
      select 1 from public.cashier_sessions s
      where s.business_id = _business.id
        and s.token_hash = extensions.digest(_session_token, 'sha256')
        and s.expires_at > now()
        and s.revoked_at is null
    ) then
      raise exception 'Cashier session invalid or expired';
    end if;
  end if;

  _clean_query := trim(_query);
  if _clean_query = '' then
    return;
  end if;

  -- 1. Try exact or case-insensitive serial match on pass_instances for this business
  select * into _pass
  from public.pass_instances p
  where p.business_id = _business.id
    and (
      p.serial = _clean_query
      or lower(p.serial) = lower(_clean_query)
      or p.wallet_serial = _clean_query
    )
  order by p.created_at asc
  limit 1;

  -- 2. If not found by serial, check if query matches customer phone
  if not found then
    _norm_phone := public.normalize_customer_phone(_clean_query);
    if _norm_phone is not null then
      select * into _pass
      from public.pass_instances p
      where p.business_id = _business.id
        and (
          p.phone = _norm_phone
          or p.phone = _clean_query
        )
      order by p.created_at asc
      limit 1;
    end if;
  end if;

  -- 3. If pass is found, calculate transaction metrics and return
  if found then
    select
      coalesce(count(case when t.action = 'redeem' then 1 end), 0)::integer,
      coalesce(sum(case when t.stamp_delta > 0 then t.stamp_delta else 0 end), 0)::integer
    into _redeemed, _total_stamps_issued
    from public.pass_transactions t
    where t.pass_serial = _pass.serial;

    return query
    select
      _pass.serial,
      _pass.program_type,
      _business.name_en,
      coalesce(_business.offer_en, ''),
      coalesce(_business.target_stamps, 9),
      coalesce(_business.sar_per_point, 10),
      coalesce(_business.points_per_reward, 100),
      _pass.stamps,
      _pass.points,
      _pass.morphed,
      _pass.wallet_serial,
      _pass.phone,
      case
        when _pass.phone is not null then _pass.phone
        else 'Customer'
      end as customer_name,
      _redeemed,
      _total_stamps_issued;
    return;
  end if;
end;
$$;

revoke all on function public.cashier_lookup_pass(text, text, text) from public;
grant execute on function public.cashier_lookup_pass(text, text, text) to anon, authenticated, service_role;

commit;

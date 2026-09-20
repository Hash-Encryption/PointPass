-- ============================================================================
-- PointPass Functional V1 — Phase 5 Production Hardening Migration
-- 20260920050000_phase5_production_hardening.sql
--
-- Forward-only migration containing:
-- 1. Justified Performance Indexes (businesses.owner_id, pass_transactions.branch_id)
-- 2. Anonymous Public-Claim Abuse Resistance Backstop
-- 3. Strict Permission and Grant Integrity Preservation
-- ============================================================================

begin;

-- ============================================================================
-- 1. PERFORMANCE INDEXES
-- ============================================================================

-- Index 1: Optimize owner dashboard and onboarding business lookups by owner_id
create index if not exists idx_businesses_owner_id
  on public.businesses (owner_id);

-- Index 2: Optimize location-scoped analytics and customer transaction lookups
create index if not exists idx_pass_transactions_branch_created
  on public.pass_transactions (branch_id, created_at desc);

-- ============================================================================
-- 2. ANONYMOUS PUBLIC-CLAIM ABUSE RESISTANCE BACKSTOP
-- ============================================================================
-- Enhances claim_public_pass with an abuse backstop for anonymous guest claims,
-- preventing automated burst flooding while preserving legitimate customer traffic.

create or replace function public.claim_public_pass(_slug text, _phone text default null)
returns table (
  pass_serial text,
  pass_program_type public.program_type,
  business_name text,
  business_offer text,
  business_target_stamps integer,
  business_sar_per_point integer,
  business_points_per_reward integer,
  pass_stamps integer,
  pass_points integer,
  pass_morphed boolean,
  pass_wallet_serial text,
  is_resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _business public.businesses%rowtype;
  _normalized_phone text;
  _existing_pass public.pass_instances%rowtype;
  _recent_anon_burst integer;
begin
  -- 1. Validate active business
  select b.* into _business
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active';

  if not found then
    raise exception 'Business not found or inactive';
  end if;

  -- 2. Differentiate Identified Customer vs Anonymous Guest
  if _phone is not null and trim(_phone) <> '' then
    _normalized_phone := public.normalize_customer_phone(_phone);
    if _normalized_phone is null then
      raise exception 'Phone identifier must contain a valid phone number';
    end if;

    -- Concurrency Protection: Acquire transactional advisory lock keyed by (business_id, normalized_phone)
    perform pg_advisory_xact_lock(hashtext('pass_claim:' || _business.id::text || ':' || _normalized_phone));

    -- Deterministic Existing Pass Lookup:
    -- 1. Prefer pass with an attached wallet (wallet_serial is not null)
    -- 2. Prefer most recently active pass (last_visit_at desc nulls last)
    -- 3. Prefer older canonical pass (created_at asc)
    -- 4. Stable tiebreaker (id asc)
    select p.* into _existing_pass
    from public.pass_instances p
    where p.business_id = _business.id
      and (
        p.phone = _normalized_phone
        or p.phone = trim(_phone)
        or public.normalize_customer_phone(p.phone) = _normalized_phone
      )
    order by
      (p.wallet_serial is not null) desc,
      p.last_visit_at desc nulls last,
      p.created_at asc,
      p.id asc
    limit 1;

    if _existing_pass.id is not null then
      -- Resumed existing pass: preserve all stamps, points, morph, and history intact
      return query
      select
        _existing_pass.serial,
        _existing_pass.program_type,
        _business.name_en,
        coalesce(_business.offer_en, ''),
        coalesce(_business.target_stamps, 9),
        coalesce(_business.sar_per_point, 10),
        coalesce(_business.points_per_reward, 100),
        _existing_pass.stamps,
        _existing_pass.points,
        _existing_pass.morphed,
        _existing_pass.wallet_serial,
        true; -- is_resumed
      return;
    end if;

    -- New Identified Customer: insert with canonical normalized phone
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
      _normalized_phone,
      _business.program_type
    )
    returning
      pass_instances.serial,
      pass_instances.program_type,
      _business.name_en,
      coalesce(_business.offer_en, ''),
      coalesce(_business.target_stamps, 9),
      coalesce(_business.sar_per_point, 10),
      coalesce(_business.points_per_reward, 100),
      pass_instances.stamps,
      pass_instances.points,
      pass_instances.morphed,
      pass_instances.wallet_serial,
      false; -- is_resumed

  else
    -- Anonymous Guest: Phone is explicitly NULL.
    -- Abuse backstop: prevent automated bursts from overwhelming database while preserving legitimate traffic.
    select count(*) into _recent_anon_burst
    from public.pass_instances pi
    where pi.business_id = _business.id
      and pi.phone is null
      and pi.created_at >= (now() - interval '10 seconds');

    if _recent_anon_burst >= 60 then
      raise exception 'Too many guest pass requests. Please try again in a moment.';
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
      null,
      _business.program_type
    )
    returning
      pass_instances.serial,
      pass_instances.program_type,
      _business.name_en,
      coalesce(_business.offer_en, ''),
      coalesce(_business.target_stamps, 9),
      coalesce(_business.sar_per_point, 10),
      coalesce(_business.points_per_reward, 100),
      pass_instances.stamps,
      pass_instances.points,
      pass_instances.morphed,
      pass_instances.wallet_serial,
      false; -- is_resumed
  end if;
end;
$$;

revoke all on function public.claim_public_pass(text, text) from public;
grant execute on function public.claim_public_pass(text, text) to anon, authenticated;

commit;

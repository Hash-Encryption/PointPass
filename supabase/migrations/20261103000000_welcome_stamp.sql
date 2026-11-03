begin;

-- 1. Helper function for programmatic welcome stamp assignment
create or replace function public.grant_welcome_stamp(_pass_serial text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pass_instances
  set stamps = 1
  where serial = trim(_pass_serial)
    and program_type in ('stamp', 'coupon_morph')
    and coalesce(stamps, 0) = 0;

  return true;
end;
$$;

revoke all on function public.grant_welcome_stamp(text) from public;
grant execute on function public.grant_welcome_stamp(text) to anon, authenticated;

-- 2. Include template_id in public business lookup so anon claimants receive exact theme colors
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
  offer_en text,
  template_id text
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
    coalesce(b.offer_en, ''),
    b.template_id
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
  limit 1
$$;

revoke all on function public.get_public_business_by_slug(text) from public;
grant execute on function public.get_public_business_by_slug(text) to anon, authenticated;

commit;

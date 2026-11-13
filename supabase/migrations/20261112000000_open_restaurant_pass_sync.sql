-- ============================================================================
-- PointPass — Direct Restaurant-to-Pass DB Sync (No RLS Friction)
-- 20261112000000_open_restaurant_pass_sync.sql
--
-- 1. Grants unrestricted public read (SELECT) on public.businesses & pass_instances
--    so /join/$slug and /scan are never blocked from reading template_id / brand_color.
-- 2. Expands get_public_business_by_slug RPC to return all restaurant design columns.
-- 3. Syncs existing rows (including 'testpass') so template_id and brand_color hold
--    both Pro hex/style and Free Tier colorPreset/stampIcon backup.
-- ============================================================================

begin;

-- 1. Ensure template_id column exists on public.businesses
alter table public.businesses
  add column if not exists template_id text;

-- 2. Grant public read access so RLS never hides restaurant branding or pass state
grant select on public.businesses to anon, authenticated;
grant select on public.pass_instances to anon, authenticated;

drop policy if exists "Allow public read of all businesses" on public.businesses;
create policy "Allow public read of all businesses"
  on public.businesses
  for select
  to public
  using (true);

drop policy if exists "Allow public read of all pass instances" on public.pass_instances;
create policy "Allow public read of all pass instances"
  on public.pass_instances
  for select
  to public
  using (true);

-- 3. Return all restaurant design columns from get_public_business_by_slug
drop function if exists public.get_public_business_by_slug(text);

create or replace function public.get_public_business_by_slug(_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  name_ar text,
  name_en text,
  logo_url text,
  brand_color text,
  accent_color text,
  program_type public.program_type,
  offer_ar text,
  offer_en text,
  stamps_required integer,
  target_stamps integer,
  sar_per_point integer,
  points_per_reward integer,
  template_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.slug,
    coalesce(nullif(b.name_en, ''), nullif(b.name_ar, ''), b.slug) as name,
    b.name_ar,
    b.name_en,
    b.logo_url,
    b.brand_color,
    b.accent_color,
    b.program_type,
    coalesce(b.offer_ar, '') as offer_ar,
    coalesce(b.offer_en, '') as offer_en,
    coalesce(b.target_stamps, 8) as stamps_required,
    coalesce(b.target_stamps, 8) as target_stamps,
    coalesce(b.sar_per_point, 10) as sar_per_point,
    coalesce(b.points_per_reward, 100) as points_per_reward,
    b.template_id
  from public.businesses b
  where b.slug = lower(trim(_slug))
    and b.status = 'active'
  limit 1
$$;

revoke all on function public.get_public_business_by_slug(text) from public;
grant execute on function public.get_public_business_by_slug(text) to anon, authenticated, service_role;

-- 4. Sync existing business rows (specifically 'testpass' and unconfigured/blank rows)
update public.businesses
set
  template_id = 'tpl_stamp_coffee_' || coalesce(target_stamps, 8)::text || '__icon-coffee__style-pizzatown__preset-orange__tier-free',
  brand_color = '#e65100',
  accent_color = coalesce(nullif(accent_color, ''), '#fbbf24'),
  target_stamps = coalesce(target_stamps, 8)
where slug = 'testpass'
  and (
    template_id is null
    or template_id like 'tpl_stamp_blank%'
    or template_id not like '%preset-%'
    or lower(coalesce(brand_color, '')) in ('', '#059669', '#c2410c')
  );

update public.businesses
set
  template_id = case
    when lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(☕|coffee|قهوة|كافيه|مقهى|espresso|latte)'
      then 'tpl_stamp_coffee_' || coalesce(target_stamps, 8)::text || '__icon-coffee__style-pizzatown__preset-orange__tier-free'
    when lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🍔|burger|برجر|bistro|pizza|بيتزا)'
      then 'tpl_stamp_burger_' || coalesce(target_stamps, 8)::text || '__icon-burger__style-pizzatown__preset-red__tier-free'
    when lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🥐|bakery|مخبز|حلويات|sweets|pastry)'
      then 'tpl_stamp_bakery_' || coalesce(target_stamps, 8)::text || '__icon-bakery__style-pizzatown__preset-orange__tier-free'
    when lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(✂️|salon|صالون|حلاقة|barber)'
      then 'tpl_stamp_salon_' || coalesce(target_stamps, 8)::text || '__icon-salon__style-pizzatown__preset-purple__tier-free'
    when lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🚗|car|غسيل|سيارات)'
      then 'tpl_stamp_car_' || coalesce(target_stamps, 8)::text || '__icon-car__style-pizzatown__preset-blue__tier-free'
    else coalesce(template_id, 'tpl_stamp_custom_' || coalesce(target_stamps, 8)::text || '__icon-star__style-pizzatown__preset-dark__tier-free')
  end,
  brand_color = case
    when lower(coalesce(brand_color, '')) in ('', '#059669') and lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(☕|coffee|قهوة|كافيه|مقهى|espresso|latte)'
      then '#e65100'
    when lower(coalesce(brand_color, '')) in ('', '#059669') and lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🍔|burger|برجر|bistro|pizza|بيتزا)'
      then '#dc2626'
    when lower(coalesce(brand_color, '')) in ('', '#059669') and lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🥐|bakery|مخبز|حلويات|sweets|pastry)'
      then '#e65100'
    when lower(coalesce(brand_color, '')) in ('', '#059669') and lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(✂️|salon|صالون|حلاقة|barber)'
      then '#7c3aed'
    when lower(coalesce(brand_color, '')) in ('', '#059669') and lower(coalesce(offer_en, '') || ' ' || coalesce(offer_ar, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(name_ar, '')) ~ '(🚗|car|غسيل|سيارات)'
      then '#2563eb'
    else brand_color
  end
where template_id is null
   or template_id like 'tpl_stamp_blank%'
   or template_id not like '%preset-%';

commit;

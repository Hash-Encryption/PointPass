-- Wallet Loyalty SaaS — schema for the connected Supabase project.
-- Run this in the SQL editor of the Supabase project configured in your environment.

create type public.app_role as enum ('super_admin', 'merchant', 'cashier');
create type public.program_type as enum ('stamp', 'points', 'coupon_morph');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  business_id uuid,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  slug text unique not null,
  name_ar text not null,
  name_en text not null,
  logo_url text,
  brand_color text not null default '#059669',
  accent_color text not null default '#F59E0B',
  program_type program_type not null default 'stamp',
  offer_ar text default '',
  offer_en text default '',
  target_stamps int default 9,
  sar_per_point int default 10,
  cashier_pin text default '1234',
  latitude double precision,
  longitude double precision,
  geo_text_ar text,
  geo_text_en text,
  custom_domain text,
  plan text not null default 'starter',
  status text not null default 'active',
  active_passes int not null default 0,
  redemptions int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.businesses to anon;
grant select, insert, update, delete on public.businesses to authenticated;
grant all on public.businesses to service_role;
alter table public.businesses enable row level security;

create policy "public can read businesses" on public.businesses
  for select to anon using (status = 'active');
create policy "owner reads own business" on public.businesses
  for select to authenticated using (auth.uid() = owner_id or public.has_role(auth.uid(), 'super_admin'));
create policy "owner updates own business" on public.businesses
  for update to authenticated using (auth.uid() = owner_id or public.has_role(auth.uid(), 'super_admin'));
create policy "admin inserts business" on public.businesses
  for insert to authenticated with check (public.has_role(auth.uid(), 'super_admin'));

create table public.pass_instances (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null references public.businesses(slug) on delete cascade,
  phone text not null,
  serial text unique default gen_random_uuid()::text,
  program_type program_type not null default 'stamp',
  stamps int not null default 0,
  points int not null default 0,
  morphed boolean not null default false,
  last_visit_at timestamptz,
  created_at timestamptz not null default now()
);
grant insert on public.pass_instances to anon;
grant select, insert, update on public.pass_instances to authenticated;
grant all on public.pass_instances to service_role;
alter table public.pass_instances enable row level security;

create policy "anyone can claim a pass" on public.pass_instances
  for insert to anon with check (true);
create policy "merchant reads own passes" on public.pass_instances
  for select to authenticated using (
    exists (select 1 from public.businesses b where b.slug = business_slug and (b.owner_id = auth.uid() or public.has_role(auth.uid(), 'super_admin')))
  );

create table public.pass_transactions (
  id uuid primary key default gen_random_uuid(),
  pass_serial text not null,
  action text not null check (action in ('stamp', 'points', 'redeem')),
  amount_sar numeric,
  created_at timestamptz not null default now()
);
grant insert on public.pass_transactions to anon;
grant select, insert on public.pass_transactions to authenticated;
grant all on public.pass_transactions to service_role;
alter table public.pass_transactions enable row level security;

create policy "cashier logs transactions" on public.pass_transactions
  for insert to anon with check (true);
create policy "authenticated reads transactions" on public.pass_transactions
  for select to authenticated using (true);

create table public.hardware_dispatch (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  item text not null,
  quantity int not null default 1,
  status text not null default 'packing',
  tracking_no text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.hardware_dispatch to authenticated;
grant all on public.hardware_dispatch to service_role;
alter table public.hardware_dispatch enable row level security;

create policy "admin manages hardware" on public.hardware_dispatch
  for all to authenticated using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

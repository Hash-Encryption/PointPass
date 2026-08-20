begin;

do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_role'
  ) then
    create type public.app_role as enum ('super_admin', 'merchant', 'cashier');
  end if;

  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'program_type'
  ) then
    create type public.program_type as enum ('stamp', 'points', 'coupon_morph');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  business_id uuid
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  merchant_email text,
  slug text unique not null,
  name_ar text not null,
  name_en text not null,
  logo_url text,
  brand_color text not null default '#059669',
  accent_color text not null default '#F59E0B',
  program_type public.program_type not null default 'stamp',
  offer_ar text default '',
  offer_en text default '',
  target_stamps int default 9,
  sar_per_point int default 10,
  cashier_pin text,
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

alter table public.user_roles add column if not exists business_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_roles_business_id_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_business_id_fkey
      foreign key (business_id) references public.businesses(id) on delete cascade;
  end if;
end $$;

alter table public.user_roles drop constraint if exists user_roles_user_id_role_key;

create unique index if not exists user_roles_platform_role_unique
  on public.user_roles (user_id, role)
  where business_id is null;

create unique index if not exists user_roles_business_role_unique
  on public.user_roles (user_id, business_id, role)
  where business_id is not null;

create index if not exists idx_businesses_merchant_email
  on public.businesses (lower(merchant_email));

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

drop policy if exists "own roles readable" on public.user_roles;
create policy "own roles readable"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.businesses to authenticated;
grant all on public.businesses to service_role;
revoke all on public.businesses from anon;
alter table public.businesses enable row level security;

drop policy if exists "owner reads own business" on public.businesses;
drop policy if exists "owner updates own business" on public.businesses;
drop policy if exists "admin inserts business" on public.businesses;

create policy "owner reads own business"
on public.businesses for select to authenticated
using (auth.uid() = owner_id or public.has_role(auth.uid(), 'super_admin'));

create policy "owner updates own business"
on public.businesses for update to authenticated
using (auth.uid() = owner_id or public.has_role(auth.uid(), 'super_admin'));

create policy "admin inserts business"
on public.businesses for insert to authenticated
with check (public.has_role(auth.uid(), 'super_admin'));

create table if not exists public.pass_instances (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null references public.businesses(slug) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  phone text not null,
  serial text unique default gen_random_uuid()::text,
  wallet_serial text unique,
  program_type public.program_type not null default 'stamp',
  stamps int not null default 0,
  points int not null default 0,
  morphed boolean not null default false,
  last_visit_at timestamptz,
  created_at timestamptz not null default now()
);

grant select on public.pass_instances to authenticated;
grant all on public.pass_instances to service_role;
revoke all on public.pass_instances from anon;
alter table public.pass_instances enable row level security;

drop policy if exists "merchant reads own passes" on public.pass_instances;
create policy "merchant reads own passes"
on public.pass_instances for select to authenticated
using (
  exists (
    select 1 from public.businesses b
    where b.id = business_id
      and (b.owner_id = auth.uid() or public.has_role(auth.uid(), 'super_admin'))
  )
);

create table if not exists public.pass_transactions (
  id uuid primary key default gen_random_uuid(),
  pass_serial text not null,
  business_id uuid references public.businesses(id) on delete cascade,
  action text not null check (action in ('stamp', 'points', 'redeem')),
  amount_sar numeric,
  created_at timestamptz not null default now()
);

grant select on public.pass_transactions to authenticated;
grant all on public.pass_transactions to service_role;
revoke all on public.pass_transactions from anon;
alter table public.pass_transactions enable row level security;

drop policy if exists "authenticated reads transactions" on public.pass_transactions;
create policy "authenticated reads transactions"
on public.pass_transactions for select to authenticated
using (public.has_role(auth.uid(), 'super_admin'));

create table if not exists public.hardware_dispatch (
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

drop policy if exists "admin manages hardware" on public.hardware_dispatch;
create policy "admin manages hardware"
on public.hardware_dispatch for all to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

commit;

begin;

alter table public.user_roles
  add column if not exists business_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_roles_business_id_fkey'
      and conrelid = 'public.user_roles'::regclass
  ) then
    alter table public.user_roles
      add constraint user_roles_business_id_fkey
      foreign key (business_id)
      references public.businesses(id)
      on delete cascade;
  end if;
end $$;

alter table public.user_roles
  drop constraint if exists user_roles_user_id_role_key;

create unique index if not exists user_roles_platform_role_unique
  on public.user_roles (user_id, role)
  where business_id is null;

create unique index if not exists user_roles_business_role_unique
  on public.user_roles (user_id, business_id, role)
  where business_id is not null;

create or replace function public.can_access_business(_user_id uuid, _business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1
      from public.user_roles
      where user_id = _user_id
        and business_id = _business_id
        and role in ('merchant', 'cashier')
    )
$$;

create or replace function public.can_manage_business(_user_id uuid, _business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or exists (
      select 1
      from public.user_roles
      where user_id = _user_id
        and business_id = _business_id
        and role = 'merchant'
    )
$$;

drop policy if exists "own roles readable" on public.user_roles;
drop policy if exists "members read relevant roles" on public.user_roles;
drop policy if exists "admins manage business roles" on public.user_roles;

create policy "members read relevant roles"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'super_admin')
);

create policy "admins manage business roles"
on public.user_roles
for all
to authenticated
using (public.has_role(auth.uid(), 'super_admin'))
with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "owner reads own business" on public.businesses;
drop policy if exists "owner updates own business" on public.businesses;
drop policy if exists "members read their businesses" on public.businesses;
drop policy if exists "merchants update their businesses" on public.businesses;

create policy "members read their businesses"
on public.businesses
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.can_access_business(auth.uid(), id)
);

create policy "merchants update their businesses"
on public.businesses
for update
to authenticated
using (
  owner_id = auth.uid()
  or public.can_manage_business(auth.uid(), id)
)
with check (
  owner_id = auth.uid()
  or public.can_manage_business(auth.uid(), id)
);

create or replace function public.protect_business_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.has_role(auth.uid(), 'super_admin') and (
    new.owner_id is distinct from old.owner_id
    or new.slug is distinct from old.slug
    or new.plan is distinct from old.plan
    or new.status is distinct from old.status
    or new.active_passes is distinct from old.active_passes
    or new.redemptions is distinct from old.redemptions
    or new.custom_domain is distinct from old.custom_domain
  ) then
    raise exception 'Only super admins can update protected business fields';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_business_admin_fields on public.businesses;
create trigger protect_business_admin_fields
before update on public.businesses
for each row execute function public.protect_business_admin_fields();

revoke select on public.businesses from anon;
grant select (
  slug,
  name_ar,
  name_en,
  logo_url,
  brand_color,
  accent_color,
  program_type,
  offer_ar,
  offer_en,
  target_stamps,
  sar_per_point,
  status
) on public.businesses to anon;

create table if not exists public.business_automations (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  inactive_14_enabled boolean not null default true,
  inactive_30_enabled boolean not null default true,
  inactive_60_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.business_automations to authenticated;
alter table public.business_automations enable row level security;

drop policy if exists "members read business automations" on public.business_automations;
drop policy if exists "merchants manage business automations" on public.business_automations;

create policy "members read business automations"
on public.business_automations
for select
to authenticated
using (public.can_access_business(auth.uid(), business_id));

create policy "merchants manage business automations"
on public.business_automations
for all
to authenticated
using (public.can_manage_business(auth.uid(), business_id))
with check (public.can_manage_business(auth.uid(), business_id));

create or replace function public.admin_create_business(
  _merchant_email text,
  _slug text,
  _name_ar text,
  _name_en text,
  _plan text default 'starter'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _merchant_id uuid;
  _business_id uuid;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'Only super admins can create businesses';
  end if;

  select id into _merchant_id
  from auth.users
  where lower(email) = lower(trim(_merchant_email));

  if _merchant_id is null then
    raise exception 'Create or invite this merchant in Authentication > Users first';
  end if;

  insert into public.businesses (owner_id, slug, name_ar, name_en, plan)
  values (_merchant_id, lower(trim(_slug)), trim(_name_ar), trim(_name_en), _plan)
  returning id into _business_id;

  insert into public.user_roles (user_id, role, business_id)
  values (_merchant_id, 'merchant', _business_id)
  on conflict do nothing;

  return _business_id;
end;
$$;

grant execute on function public.admin_create_business(text, text, text, text, text)
to authenticated;

alter table public.pass_instances
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;

update public.pass_instances p
set business_id = b.id
from public.businesses b
where p.business_id is null
  and b.slug = p.business_slug;

create or replace function public.set_pass_business_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.business_id is null then
    select id into new.business_id
    from public.businesses
    where slug = new.business_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists set_pass_business_id on public.pass_instances;
create trigger set_pass_business_id
before insert or update of business_slug, business_id
on public.pass_instances
for each row execute function public.set_pass_business_id();

drop policy if exists "merchant reads own passes" on public.pass_instances;
drop policy if exists "members read business passes" on public.pass_instances;

create policy "members read business passes"
on public.pass_instances
for select
to authenticated
using (public.can_access_business(auth.uid(), business_id));

alter table public.pass_transactions
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;

update public.pass_transactions t
set business_id = p.business_id
from public.pass_instances p
where t.business_id is null
  and p.serial = t.pass_serial;

create or replace function public.set_transaction_business_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.business_id is null then
    select business_id into new.business_id
    from public.pass_instances
    where serial = new.pass_serial;
  end if;
  return new;
end;
$$;

drop trigger if exists set_transaction_business_id on public.pass_transactions;
create trigger set_transaction_business_id
before insert or update of pass_serial, business_id
on public.pass_transactions
for each row execute function public.set_transaction_business_id();

drop policy if exists "authenticated reads transactions" on public.pass_transactions;
drop policy if exists "members read business transactions" on public.pass_transactions;

create policy "members read business transactions"
on public.pass_transactions
for select
to authenticated
using (public.can_access_business(auth.uid(), business_id));

insert into storage.buckets (id, name, public)
values ('business-assets', 'business-assets', true)
on conflict (id) do update set public = excluded.public;

create or replace function public.storage_business_id(_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists "members upload business assets" on storage.objects;
drop policy if exists "members update business assets" on storage.objects;

create policy "members upload business assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-assets'
  and public.can_manage_business(
    auth.uid(),
    public.storage_business_id(name)
  )
);

create policy "members update business assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-assets'
  and public.can_manage_business(
    auth.uid(),
    public.storage_business_id(name)
  )
)
with check (
  bucket_id = 'business-assets'
  and public.can_manage_business(
    auth.uid(),
    public.storage_business_id(name)
  )
);

commit;

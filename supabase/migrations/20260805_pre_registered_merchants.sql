begin;

-- 1. Add merchant_email column to public.businesses
alter table public.businesses
  add column if not exists merchant_email text;

create index if not exists idx_businesses_merchant_email
  on public.businesses (lower(merchant_email));

-- 2. Update RLS policy on public.businesses to allow users matching merchant_email to read their pre-registered business
drop policy if exists "members read their businesses" on public.businesses;

create policy "members read their businesses"
on public.businesses
for select
to authenticated
using (
  owner_id = auth.uid()
  or lower(merchant_email) = lower(auth.jwt() ->> 'email')
  or public.can_access_business(auth.uid(), id)
);

-- 3. Update admin_create_business function
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
as $func$
declare
  _merchant_id uuid;
  _business_id uuid;
  _clean_email text;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'Only super admins can create businesses';
  end if;

  _clean_email := lower(trim(_merchant_email));

  select id into _merchant_id
  from auth.users
  where lower(email) = _clean_email;

  insert into public.businesses (owner_id, merchant_email, slug, name_ar, name_en, plan)
  values (_merchant_id, _clean_email, lower(trim(_slug)), trim(_name_ar), trim(_name_en), _plan)
  on conflict (slug) do update set
    owner_id = coalesce(excluded.owner_id, businesses.owner_id),
    merchant_email = excluded.merchant_email
  returning id into _business_id;

  if _merchant_id is not null then
    insert into public.user_roles (user_id, role, business_id)
    values (_merchant_id, 'merchant', _business_id)
    on conflict do nothing;
  end if;

  return _business_id;
end;
$func$;

grant execute on function public.admin_create_business(text, text, text, text, text)
to authenticated;

-- 4. Automatic linking trigger when a user signs up in auth.users
create or replace function public.handle_new_user_merchant_link()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $func$
declare
  _biz record;
begin
  if NEW.email is null then
    return NEW;
  end if;

  for _biz in
    select id, owner_id
    from public.businesses
    where lower(merchant_email) = lower(trim(NEW.email))
  loop
    if _biz.owner_id is null then
      update public.businesses
      set owner_id = NEW.id
      where id = _biz.id;
    end if;

    insert into public.user_roles (user_id, role, business_id)
    values (NEW.id, 'merchant', _biz.id)
    on conflict do nothing;
  end loop;

  return NEW;
end;
$func$;

drop trigger if exists on_auth_user_created_link_merchant on auth.users;
create trigger on_auth_user_created_link_merchant
  after insert on auth.users
  for each row execute function public.handle_new_user_merchant_link();

-- 5. Retroactively link any existing user accounts to pre-registered businesses
do $func$
declare
  _biz record;
  _user_id uuid;
begin
  for _biz in select id, merchant_email, owner_id from public.businesses loop
    if _biz.merchant_email is not null then
      select id into _user_id from auth.users where lower(email) = lower(trim(_biz.merchant_email));
      if _user_id is not null then
        update public.businesses set owner_id = _user_id where id = _biz.id and (owner_id is null or owner_id <> _user_id);
        insert into public.user_roles (user_id, role, business_id)
        values (_user_id, 'merchant', _biz.id)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end $func$;

-- 6. Allow both anon and authenticated to claim pass instances
drop policy if exists "anyone can claim a pass" on public.pass_instances;
create policy "anyone can claim a pass" on public.pass_instances
  for insert to public with check (true);

commit;

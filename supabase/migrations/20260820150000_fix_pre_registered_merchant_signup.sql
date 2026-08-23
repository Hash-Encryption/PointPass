begin;

-- Let the auth.users signup trigger claim only the business pre-registered for
-- that exact email. All other protected business updates remain admin-only.
create or replace function public.protect_business_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _is_pre_registered_owner_claim boolean := false;
begin
  if old.owner_id is null
    and new.owner_id is not null
    and new.owner_id is distinct from old.owner_id
    and old.merchant_email is not null
  then
    select exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = new.owner_id
        and lower(trim(auth_user.email)) = lower(trim(old.merchant_email))
    )
    into _is_pre_registered_owner_claim;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
    and not public.has_role(auth.uid(), 'super_admin')
    and (
      (new.owner_id is distinct from old.owner_id and not _is_pre_registered_owner_claim)
      or new.slug is distinct from old.slug
      or new.plan is distinct from old.plan
      or new.status is distinct from old.status
      or new.active_passes is distinct from old.active_passes
      or new.redemptions is distinct from old.redemptions
      or new.custom_domain is distinct from old.custom_domain
    )
  then
    raise exception 'Only super admins can update protected business fields';
  end if;

  return new;
end;
$function$;

commit;

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

commit;

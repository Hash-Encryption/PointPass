begin;

alter table public.businesses
  add column if not exists template_id text;

commit;

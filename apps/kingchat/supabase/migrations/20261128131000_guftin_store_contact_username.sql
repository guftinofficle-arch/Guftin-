alter table public.kc_business_profiles add column if not exists contact_username text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='kc_business_profiles_contact_username_format'
      and conrelid='public.kc_business_profiles'::regclass
  ) then
    alter table public.kc_business_profiles
      add constraint kc_business_profiles_contact_username_format
      check (contact_username is null or contact_username ~ '^[a-z0-9_]{3,24}$') not valid;
  end if;
end;
$$;
alter table public.kc_business_profiles validate constraint kc_business_profiles_contact_username_format;
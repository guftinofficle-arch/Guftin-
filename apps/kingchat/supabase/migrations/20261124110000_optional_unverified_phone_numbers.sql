-- Store optional, unverified phone numbers in a private schema.
-- Phone numbers are never Supabase Auth credentials and are never used to log in.
create table if not exists private.kc_optional_phone_numbers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kc_optional_phone_numbers_e164
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$')
);
create index if not exists kc_optional_phone_numbers_phone_idx
  on private.kc_optional_phone_numbers (phone_number);
alter table private.kc_optional_phone_numbers enable row level security;
revoke all on table private.kc_optional_phone_numbers from public, anon, authenticated;

create or replace function private.kc_set_optional_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_email_confirmed_at timestamptz;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select u.email_confirmed_at into v_email_confirmed_at
  from auth.users u where u.id = v_uid;
  if v_email_confirmed_at is null then
    raise exception 'Verify your email before saving a mobile number';
  end if;
  if p_phone is null or pg_catalog.btrim(p_phone) = '' then
    delete from private.kc_optional_phone_numbers where user_id = v_uid;
    return;
  end if;
  v_phone := pg_catalog.regexp_replace(pg_catalog.btrim(p_phone), '[^0-9+]', '', 'g');
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter a valid international mobile number';
  end if;
  insert into private.kc_optional_phone_numbers(user_id, phone_number, updated_at)
  values (v_uid, v_phone, now())
  on conflict (user_id) do update
    set phone_number = excluded.phone_number, updated_at = now();
end;
$function$;

create or replace function private.kc_get_optional_phone()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select n.phone_number
  from private.kc_optional_phone_numbers n
  where n.user_id = auth.uid()
  limit 1;
$function$;

create or replace function private.kc_lookup_phone_contacts(p_phone_numbers text[])
returns table (
  matched_phone text,
  contact_id uuid,
  display_name text,
  username text,
  avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_numbers text[];
  v_requests integer;
  v_numbers_checked integer;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if p_phone_numbers is null or cardinality(p_phone_numbers) = 0 then return; end if;
  if cardinality(p_phone_numbers) > 250 then
    raise exception 'Check up to 250 phone contacts per request';
  end if;

  select array_agg(distinct normalized.phone) into v_numbers
  from (
    select pg_catalog.regexp_replace(pg_catalog.btrim(value), '[^0-9+]', '', 'g') as phone
    from pg_catalog.unnest(p_phone_numbers) as supplied(value)
  ) as normalized
  where normalized.phone ~ '^\+[1-9][0-9]{7,14}$';

  if v_numbers is null or cardinality(v_numbers) = 0 then
    raise exception 'No valid international phone numbers were found';
  end if;

  insert into private.kc_phone_lookup_limits as limits
    (user_id, window_started_at, request_count, numbers_checked)
  values (v_uid, now(), 1, cardinality(v_numbers))
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '10 minutes' then now()
          else limits.window_started_at end,
        request_count = case
          when limits.window_started_at < now() - interval '10 minutes' then 1
          else limits.request_count + 1 end,
        numbers_checked = case
          when limits.window_started_at < now() - interval '10 minutes' then cardinality(v_numbers)
          else limits.numbers_checked + cardinality(v_numbers) end
  returning request_count, numbers_checked into v_requests, v_numbers_checked;

  if v_requests > 5 or v_numbers_checked > 1250 then
    raise exception 'Contact matching limit reached. Please try again later';
  end if;

  insert into public.kc_contacts(owner_id, contact_id)
  select v_uid, n.user_id
  from private.kc_optional_phone_numbers n
  join auth.users u on u.id = n.user_id and u.email_confirmed_at is not null
  join public.kc_profiles p on p.id = n.user_id and p.username is not null
  where n.user_id <> v_uid and n.phone_number = any(v_numbers)
  on conflict (owner_id, contact_id) do nothing;

  return query
  select n.phone_number, p.id, p.display_name, p.username, p.avatar_url
  from private.kc_optional_phone_numbers n
  join auth.users u on u.id = n.user_id and u.email_confirmed_at is not null
  join public.kc_profiles p on p.id = n.user_id and p.username is not null
  where n.user_id <> v_uid and n.phone_number = any(v_numbers)
  order by lower(coalesce(p.display_name, p.username));
end;
$function$;

-- Public RPC wrappers are invoker-security only. The privileged implementation stays private.
create or replace function public.kc_set_optional_phone(p_phone text)
returns void
language sql
security invoker
set search_path = ''
as $function$ select private.kc_set_optional_phone(p_phone); $function$;

create or replace function public.kc_get_optional_phone()
returns text
language sql
stable
security invoker
set search_path = ''
as $function$ select private.kc_get_optional_phone(); $function$;

create or replace function public.kc_lookup_phone_contacts(p_phone_numbers text[])
returns table (
  matched_phone text,
  contact_id uuid,
  display_name text,
  username text,
  avatar_url text
)
language sql
security invoker
set search_path = ''
as $function$ select * from private.kc_lookup_phone_contacts(p_phone_numbers); $function$;

grant usage on schema private to authenticated;
revoke all on function private.kc_set_optional_phone(text) from public, anon;
revoke all on function private.kc_get_optional_phone() from public, anon;
revoke all on function private.kc_lookup_phone_contacts(text[]) from public, anon;
grant execute on function private.kc_set_optional_phone(text) to authenticated;
grant execute on function private.kc_get_optional_phone() to authenticated;
grant execute on function private.kc_lookup_phone_contacts(text[]) to authenticated;

revoke all on function public.kc_set_optional_phone(text) from public, anon;
revoke all on function public.kc_get_optional_phone() from public, anon;
revoke all on function public.kc_lookup_phone_contacts(text[]) from public, anon;
grant execute on function public.kc_set_optional_phone(text) to authenticated;
grant execute on function public.kc_get_optional_phone() to authenticated;
grant execute on function public.kc_lookup_phone_contacts(text[]) to authenticated;

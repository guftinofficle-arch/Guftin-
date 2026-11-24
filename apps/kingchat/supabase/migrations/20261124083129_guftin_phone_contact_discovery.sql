create schema if not exists private;

create table if not exists private.kc_phone_discovery_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists private.kc_phone_lookup_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  numbers_checked integer not null default 0
);

alter table private.kc_phone_discovery_settings enable row level security;
alter table private.kc_phone_lookup_limits enable row level security;
revoke all on table private.kc_phone_discovery_settings from public, anon, authenticated;
revoke all on table private.kc_phone_lookup_limits from public, anon, authenticated;

create or replace function public.kc_set_phone_discoverable(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_phone text;
  v_confirmed_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select u.phone, u.phone_confirmed_at
    into v_phone, v_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if coalesce(p_enabled, false) and (
    v_phone is null or v_confirmed_at is null
  ) then
    raise exception 'Verify your phone number before enabling phone contact discovery';
  end if;

  insert into private.kc_phone_discovery_settings(user_id, discoverable, updated_at)
  values (v_uid, coalesce(p_enabled, false), now())
  on conflict (user_id) do update
    set discoverable = excluded.discoverable,
        updated_at = now();

  return coalesce(p_enabled, false);
end;
$function$;

revoke all on function public.kc_set_phone_discoverable(boolean) from public, anon;
grant execute on function public.kc_set_phone_discoverable(boolean) to authenticated;

create or replace function public.kc_lookup_phone_contacts(p_phone_numbers text[])
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
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  if p_phone_numbers is null or cardinality(p_phone_numbers) = 0 then
    return;
  end if;

  if cardinality(p_phone_numbers) > 250 then
    raise exception 'Check up to 250 phone contacts per request';
  end if;

  select array_agg(distinct normalized.phone)
    into v_numbers
  from (
    select pg_catalog.regexp_replace(pg_catalog.btrim(value), '[^0-9+]', '', 'g') as phone
    from pg_catalog.unnest(p_phone_numbers) as supplied(value)
  ) as normalized
  where normalized.phone ~ '^\\+[1-9][0-9]{7,14}$';

  if v_numbers is null or cardinality(v_numbers) = 0 then
    raise exception 'No valid international phone numbers were found';
  end if;

  insert into private.kc_phone_lookup_limits as limits
    (user_id, window_started_at, request_count, numbers_checked)
  values
    (v_uid, now(), 1, cardinality(v_numbers))
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '10 minutes' then now()
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at < now() - interval '10 minutes' then 1
          else limits.request_count + 1
        end,
        numbers_checked = case
          when limits.window_started_at < now() - interval '10 minutes' then cardinality(v_numbers)
          else limits.numbers_checked + cardinality(v_numbers)
        end
  returning request_count, numbers_checked
    into v_requests, v_numbers_checked;

  if v_requests > 5 or v_numbers_checked > 1250 then
    raise exception 'Contact matching limit reached. Please try again later';
  end if;

  insert into public.kc_contacts(owner_id, contact_id)
  select v_uid, u.id
  from auth.users u
  join private.kc_phone_discovery_settings d
    on d.user_id = u.id and d.discoverable = true
  where u.id <> v_uid
    and u.phone_confirmed_at is not null
    and u.phone = any(v_numbers)
    and exists (
      select 1 from public.kc_profiles p where p.id = u.id and p.username is not null
    )
  on conflict (owner_id, contact_id) do nothing;

  return query
  select u.phone, p.id, p.display_name, p.username, p.avatar_url
  from auth.users u
  join private.kc_phone_discovery_settings d
    on d.user_id = u.id and d.discoverable = true
  join public.kc_profiles p
    on p.id = u.id and p.username is not null
  where u.id <> v_uid
    and u.phone_confirmed_at is not null
    and u.phone = any(v_numbers)
  order by lower(coalesce(p.display_name, p.username));
end;
$function$;

revoke all on function public.kc_lookup_phone_contacts(text[]) from public, anon;
grant execute on function public.kc_lookup_phone_contacts(text[]) to authenticated;

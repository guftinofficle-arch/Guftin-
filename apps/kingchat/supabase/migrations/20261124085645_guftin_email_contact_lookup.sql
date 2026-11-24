create table if not exists private.kc_email_lookup_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

create table if not exists private.kc_email_discovery_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  discoverable boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table private.kc_email_lookup_limits enable row level security;
alter table private.kc_email_discovery_settings enable row level security;
revoke all on table private.kc_email_lookup_limits from public, anon, authenticated;
revoke all on table private.kc_email_discovery_settings from public, anon, authenticated;

create or replace function public.kc_set_email_discoverable(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select u.email, u.email_confirmed_at
    into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if coalesce(p_enabled, false) and (
    v_email is null or v_confirmed_at is null
  ) then
    raise exception 'Verify your email before enabling email contact discovery';
  end if;

  insert into private.kc_email_discovery_settings(user_id, discoverable, updated_at)
  values (v_uid, coalesce(p_enabled, false), now())
  on conflict (user_id) do update
    set discoverable = excluded.discoverable,
        updated_at = now();

  return coalesce(p_enabled, false);
end;
$function$;

revoke all on function public.kc_set_email_discoverable(boolean) from public, anon;
grant execute on function public.kc_set_email_discoverable(boolean) to authenticated;

create or replace function public.kc_lookup_email_contact(p_email text)
returns table (
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
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_requests integer;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or pg_catalog.char_length(v_email) > 254 then
    raise exception 'Enter a valid email address';
  end if;

  insert into private.kc_email_lookup_limits as limits
    (user_id, window_started_at, request_count)
  values
    (v_uid, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '10 minutes' then now()
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at < now() - interval '10 minutes' then 1
          else limits.request_count + 1
        end
  returning request_count into v_requests;

  if v_requests > 8 then
    raise exception 'Contact search limit reached. Please try again later';
  end if;

  insert into public.kc_contacts(owner_id, contact_id)
  select v_uid, u.id
  from auth.users u
  left join private.kc_email_discovery_settings d on d.user_id = u.id
  where u.id <> v_uid
    and pg_catalog.lower(u.email) = v_email
    and u.email_confirmed_at is not null
    and coalesce(d.discoverable, true)
    and exists (
      select 1 from public.kc_profiles p
      where p.id = u.id and p.username is not null
    )
  on conflict (owner_id, contact_id) do nothing;

  return query
  select p.id, p.display_name, p.username, p.avatar_url
  from auth.users u
  left join private.kc_email_discovery_settings d on d.user_id = u.id
  join public.kc_profiles p on p.id = u.id and p.username is not null
  where u.id <> v_uid
    and pg_catalog.lower(u.email) = v_email
    and u.email_confirmed_at is not null
    and coalesce(d.discoverable, true);
end;
$function$;

revoke all on function public.kc_lookup_email_contact(text) from public, anon;
grant execute on function public.kc_lookup_email_contact(text) to authenticated;

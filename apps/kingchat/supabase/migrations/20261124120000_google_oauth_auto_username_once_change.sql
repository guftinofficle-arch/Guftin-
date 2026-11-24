-- Google OAuth accounts get an automatically generated username and one one-time change.
create table if not exists private.kc_google_account_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username_change_used boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.kc_google_account_flags enable row level security;
revoke all on table private.kc_google_account_flags from public, anon, authenticated;

create or replace function public.kc_finish_google_profile()
returns table (username text, display_name text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_provider text;
  v_meta jsonb;
  v_name text;
  v_base text;
  v_candidate text;
  v_suffix text;
  v_existing text;
  v_attempt integer;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select u.raw_app_meta_data->>'provider', u.raw_user_meta_data
    into v_provider, v_meta
  from auth.users u where u.id = v_uid;
  if v_provider <> 'google' then
    raise exception 'This profile setup is only for Google accounts';
  end if;

  v_name := coalesce(
    nullif(pg_catalog.btrim(v_meta->>'full_name'), ''),
    nullif(pg_catalog.btrim(v_meta->>'name'), ''),
    nullif(pg_catalog.btrim(v_meta->>'display_name'), ''),
    nullif(split_part((select email from auth.users where id=v_uid), '@', 1), ''),
    'Guftin member'
  );
  v_name := left(v_name,40);

  select p.username into v_existing
  from public.kc_profiles p where p.id=v_uid for update;

  if v_existing is null then
    v_base := pg_catalog.trim(both '_' from pg_catalog.regexp_replace(
      pg_catalog.lower(v_name), '[^a-z0-9]+', '_', 'g'
    ));
    v_base := left(v_base,18);
    if length(v_base)<3 then v_base := 'guftin_user'; end if;

    for v_attempt in 0..99 loop
      if v_attempt=0 then
        v_candidate := left(v_base,24);
      else
        v_suffix := pg_catalog.lpad(v_attempt::text,2,'0');
        v_candidate := left(v_base,21)||'_'||v_suffix;
      end if;
      begin
        insert into public.kc_profiles(id,username,display_name,phone)
        values(v_uid,v_candidate,v_name,null)
        on conflict(id) do update
          set username=coalesce(public.kc_profiles.username,excluded.username),
              display_name=excluded.display_name,
              phone=null;
        exit;
      exception when unique_violation then
        if v_attempt=99 then raise exception 'Could not generate a unique username. Please contact support.'; end if;
      end;
    end loop;
  else
    update public.kc_profiles set display_name=v_name where id=v_uid;
  end if;

  insert into private.kc_google_account_flags(user_id,username_change_used)
  values(v_uid,false) on conflict(user_id) do nothing;

  return query select p.username,p.display_name
  from public.kc_profiles p where p.id=v_uid;
end;
$function$;

create or replace function public.kc_google_username_change_available()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_provider text;
  v_used boolean;
begin
  if v_uid is null then return false; end if;
  select u.raw_app_meta_data->>'provider' into v_provider
  from auth.users u where u.id=v_uid;
  if v_provider <> 'google' then return false; end if;
  select f.username_change_used into v_used
  from private.kc_google_account_flags f where f.user_id=v_uid;
  return coalesce(v_used,false)=false;
end;
$function$;

create or replace function public.kc_change_google_username_once(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_provider text;
  v_used boolean;
  v_username text := pg_catalog.lower(pg_catalog.btrim(p_username));
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  select u.raw_app_meta_data->>'provider' into v_provider
  from auth.users u where u.id=v_uid;
  if v_provider <> 'google' then raise exception 'Only Google-created accounts can use this one-time username change'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters using letters, numbers or underscore';
  end if;

  select f.username_change_used into v_used
  from private.kc_google_account_flags f
  where f.user_id=v_uid for update;
  if v_used is null then raise exception 'Google profile setup has not completed'; end if;
  if v_used then raise exception 'Your one-time Google username change has already been used'; end if;

  begin
    update public.kc_profiles set username=v_username where id=v_uid;
  exception when unique_violation then
    raise exception 'That username is already taken. Choose another one.';
  end;
  if not found then raise exception 'Guftin profile not found'; end if;

  update private.kc_google_account_flags
    set username_change_used=true where user_id=v_uid;
end;
$function$;

revoke all on function public.kc_finish_google_profile() from public, anon;
revoke all on function public.kc_google_username_change_available() from public, anon;
revoke all on function public.kc_change_google_username_once(text) from public, anon;
grant execute on function public.kc_finish_google_profile() to authenticated;
grant execute on function public.kc_google_username_change_available() to authenticated;
grant execute on function public.kc_change_google_username_once(text) to authenticated;

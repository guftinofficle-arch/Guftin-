create or replace function public.kc_finish_profile(p_username text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(trim(p_username));
  v_existing_username text;
begin
  if v_user_id is null then
    raise exception 'Sign in required';
  end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must be 3-24 characters: letters, numbers, underscore';
  end if;
  if length(trim(p_display_name)) < 2 or length(trim(p_display_name)) > 40 then
    raise exception 'Display name must be 2-40 characters';
  end if;

  select username into v_existing_username
  from public.kc_profiles
  where id = v_user_id
  for update;

  if v_existing_username is not null and v_existing_username <> v_username then
    raise exception 'Your Guftin username is permanent and cannot be changed.';
  end if;

  -- Phone numbers stay in Supabase Auth only; never copy them to the public profile.
  insert into public.kc_profiles(id, username, display_name, phone)
  values(v_user_id, v_username, trim(p_display_name), null)
  on conflict(id) do update
    set username = coalesce(public.kc_profiles.username, excluded.username),
        display_name = excluded.display_name,
        phone = null;
end;
$function$;

revoke all on function public.kc_finish_profile(text,text) from public, anon;
grant execute on function public.kc_finish_profile(text,text) to authenticated;

update public.kc_profiles
set phone = null
where phone is not null;

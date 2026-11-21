create or replace function public.kc_is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,24}$'
    and not exists (
      select 1
      from public.kc_profiles p
      where lower(p.username) = lower(trim(p_username))
    );
$$;

revoke all on function public.kc_is_username_available(text) from public;
grant execute on function public.kc_is_username_available(text) to anon, authenticated;

-- Guftin group branding, official-channel membership and business verification foundation.
-- Privileged operations are enforced in the database, not by client-side UI checks.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter table public.kc_profiles
  add column if not exists is_verified boolean not null default false;

create table if not exists private.kc_guftin_admin_allowlist (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
revoke all on private.kc_guftin_admin_allowlist from public, anon, authenticated;
grant all on private.kc_guftin_admin_allowlist to service_role;

create or replace function private.kc_is_guftin_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from private.kc_guftin_admin_allowlist a
    where a.active = true
      and lower(a.email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;
revoke all on function private.kc_is_guftin_admin() from public, anon, authenticated;
grant execute on function private.kc_is_guftin_admin() to authenticated;

create or replace function public.kc_admin_list_profiles()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or not private.kc_is_guftin_admin() then
    raise exception 'Guftin administrator access required' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, p.is_verified, p.created_at
    from public.kc_profiles p
    order by p.created_at desc;
end;
$$;
revoke all on function public.kc_admin_list_profiles() from public, anon;
grant execute on function public.kc_admin_list_profiles() to authenticated;

create or replace function public.kc_admin_set_profile_verified(p_user_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null or not private.kc_is_guftin_admin() then
    raise exception 'Guftin administrator access required' using errcode = '42501';
  end if;
  update public.kc_profiles
    set is_verified = coalesce(p_verified, false)
    where id = p_user_id;
  if not found then
    raise exception 'Guftin user was not found';
  end if;
end;
$$;
revoke all on function public.kc_admin_set_profile_verified(uuid, boolean) from public, anon;
grant execute on function public.kc_admin_set_profile_verified(uuid, boolean) to authenticated;

create or replace function public.kc_update_group_branding(
  p_conversation_id uuid,
  p_title text,
  p_photo_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation public.kc_conversations%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select * into v_conversation
    from public.kc_conversations
    where id = p_conversation_id and kind = 'group';
  if not found then raise exception 'Group not found'; end if;

  select m.role into v_role
    from public.kc_conversation_members m
    where m.conversation_id = p_conversation_id and m.user_id = auth.uid();

  if v_conversation.created_by <> auth.uid()
     and coalesce(v_role, '') not in ('admin','owner') then
    raise exception 'Only this group creator or group admins can edit its branding'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_title,''))) < 2 or length(trim(p_title)) > 60 then
    raise exception 'Group name must contain 2 to 60 characters';
  end if;
  update public.kc_conversations
    set title = trim(p_title),
        photo_url = case when p_photo_url is null then photo_url else p_photo_url end,
        updated_at = now()
    where id = p_conversation_id;
end;
$$;
revoke all on function public.kc_update_group_branding(uuid, text, text) from public, anon;
grant execute on function public.kc_update_group_branding(uuid, text, text) to authenticated;

create or replace function public.kc_ensure_official_channel_membership()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_added integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  insert into public.kc_channel_members (conversation_id, user_id)
  select c.conversation_id, v_user_id
  from public.kc_channels c
  where c.is_official = true
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;
revoke all on function public.kc_ensure_official_channel_membership() from public, anon;
grant execute on function public.kc_ensure_official_channel_membership() to authenticated;

-- Add the official Guftin administrator's verified email to this private allowlist
-- through a trusted service-role migration/console operation. Never expose this table
-- or a service-role key to the mobile application.

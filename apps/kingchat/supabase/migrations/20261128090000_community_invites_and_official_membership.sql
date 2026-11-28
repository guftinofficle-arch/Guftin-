-- Community invites, username-based member adds, and automatic Guftin Official membership.
create table if not exists public.kc_community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.kc_communities(id) on delete cascade,
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint kc_community_invites_code_length check (length(invite_code) between 20 and 64)
);
create index if not exists kc_community_invites_community_idx on public.kc_community_invites(community_id, created_at desc);
alter table public.kc_community_invites enable row level security;
revoke all on public.kc_community_invites from anon;
grant select, insert, update on public.kc_community_invites to authenticated;
drop policy if exists kc_community_invites_admin_read on public.kc_community_invites;
create policy kc_community_invites_admin_read on public.kc_community_invites for select to authenticated using (private.kc_is_community_admin(community_id));
drop policy if exists kc_community_invites_admin_create on public.kc_community_invites;
create policy kc_community_invites_admin_create on public.kc_community_invites for insert to authenticated with check (created_by = (select auth.uid()) and private.kc_is_community_admin(community_id));
drop policy if exists kc_community_invites_admin_revoke on public.kc_community_invites;
create policy kc_community_invites_admin_revoke on public.kc_community_invites for update to authenticated using (private.kc_is_community_admin(community_id)) with check (private.kc_is_community_admin(community_id));

create or replace function public.kc_join_community_by_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_community_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in is required to join a community.' using errcode = '28000'; end if;
  select i.community_id into v_community_id from public.kc_community_invites i
  where i.invite_code = lower(trim(p_invite_code)) and i.revoked_at is null and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc limit 1;
  if v_community_id is null then raise exception 'This community invite link is invalid, expired, or revoked.' using errcode = '22023'; end if;
  insert into public.kc_community_members(community_id,user_id,role) values(v_community_id,v_user_id,'member') on conflict(community_id,user_id) do nothing;
  return v_community_id;
end; $$;
revoke all on function public.kc_join_community_by_invite(text) from public, anon;
grant execute on function public.kc_join_community_by_invite(text) to authenticated;

create or replace function public.kc_add_community_member_by_username(p_community_id uuid,p_username text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor_id uuid := auth.uid(); v_target_id uuid; v_username text := lower(trim(p_username));
begin
  if v_actor_id is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if not private.kc_is_community_admin(p_community_id) then raise exception 'Only a community owner or admin can add members.' using errcode = '42501'; end if;
  if v_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Enter a valid Guftin username.' using errcode = '22023'; end if;
  select p.id into v_target_id from public.kc_profiles p where lower(p.username)=v_username limit 1;
  if v_target_id is null then raise exception 'No Guftin account was found for that username.' using errcode = 'P0002'; end if;
  insert into public.kc_community_members(community_id,user_id,role) values(p_community_id,v_target_id,'member') on conflict(community_id,user_id) do nothing;
  return v_target_id;
end; $$;
revoke all on function public.kc_add_community_member_by_username(uuid,text) from public, anon;
grant execute on function public.kc_add_community_member_by_username(uuid,text) to authenticated;

create or replace function public.kc_list_community_members(p_community_id uuid)
returns table(user_id uuid,role text,joined_at timestamptz,username text,display_name text,avatar_url text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required.' using errcode = '28000'; end if;
  if not private.kc_is_community_member(p_community_id) then raise exception 'Join this community to view its members.' using errcode = '42501'; end if;
  return query select m.user_id,m.role,m.joined_at,p.username,p.display_name,p.avatar_url
  from public.kc_community_members m left join public.kc_profiles p on p.id=m.user_id
  where m.community_id=p_community_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end,m.joined_at asc;
end; $$;
revoke all on function public.kc_list_community_members(uuid) from public, anon;
grant execute on function public.kc_list_community_members(uuid) to authenticated;
drop policy if exists kc_business_profiles_public_read on public.kc_business_profiles;
create policy kc_business_profiles_public_read on public.kc_business_profiles for select to authenticated using (true);

create or replace function public.kc_auto_follow_guftin_official()
returns trigger language plpgsql security definer set search_path = 'pg_catalog','public','pg_temp' as $function$
declare v_official_conversation_id uuid; v_official_owner_id uuid; v_official_community_id uuid;
begin
  select conversation_id,owner_id into v_official_conversation_id,v_official_owner_id from public.kc_channels where handle='guftin-official' and is_official=true limit 1;
  if v_official_conversation_id is not null then
    insert into public.kc_channel_members(conversation_id,user_id,role) values(v_official_conversation_id,new.id,case when new.id=v_official_owner_id then 'owner' else 'follower' end) on conflict(conversation_id,user_id) do nothing;
    insert into public.kc_conversation_members(conversation_id,user_id,role) values(v_official_conversation_id,new.id,case when new.id=v_official_owner_id then 'owner' else 'follower' end) on conflict(conversation_id,user_id) do nothing;
  end if;
  select id into v_official_owner_id from auth.users where lower(email)='guftinofficle@gmail.com' limit 1;
  if v_official_owner_id is not null then
    select id into v_official_community_id from public.kc_communities where owner_id=v_official_owner_id order by created_at asc limit 1;
    if v_official_community_id is null then
      insert into public.kc_communities(owner_id,title) values(v_official_owner_id,'Guftin Official') returning id into v_official_community_id;
    else
      update public.kc_communities set title='Guftin Official',updated_at=now() where id=v_official_community_id and title='Guftin-officle';
    end if;
    insert into public.kc_community_members(community_id,user_id,role) values(v_official_community_id,new.id,case when new.id=v_official_owner_id then 'owner' else 'member' end) on conflict(community_id,user_id) do nothing;
  end if;
  return new;
end; $function$;

do $$ declare v_owner_id uuid; v_community_id uuid;
begin
  select id into v_owner_id from auth.users where lower(email)='guftinofficle@gmail.com' limit 1;
  if v_owner_id is not null then
    select id into v_community_id from public.kc_communities where owner_id=v_owner_id order by created_at asc limit 1;
    if v_community_id is null then insert into public.kc_communities(owner_id,title) values(v_owner_id,'Guftin Official') returning id into v_community_id;
    else update public.kc_communities set title='Guftin Official',updated_at=now() where id=v_community_id; end if;
    insert into public.kc_community_members(community_id,user_id,role)
    select v_community_id,u.id,case when u.id=v_owner_id then 'owner' else 'member' end from auth.users u
    on conflict(community_id,user_id) do nothing;
  end if;
end; $$;

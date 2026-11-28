-- WhatsApp-style community announcement conversations.
-- One announcement conversation is created for every community and stays pinned above its groups.
create table if not exists public.kc_community_announcements (
  community_id uuid primary key references public.kc_communities(id) on delete cascade,
  conversation_id uuid not null unique references public.kc_conversations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists kc_community_announcements_conversation_idx
  on public.kc_community_announcements(conversation_id);

alter table public.kc_community_announcements enable row level security;
revoke all on public.kc_community_announcements from public, anon;
grant select on public.kc_community_announcements to authenticated;
drop policy if exists kc_community_announcements_member_read on public.kc_community_announcements;
create policy kc_community_announcements_member_read
  on public.kc_community_announcements for select to authenticated
  using (exists (
    select 1 from public.kc_community_members m
    where m.community_id = kc_community_announcements.community_id
      and m.user_id = (select auth.uid())
  ));

create or replace function private.kc_create_community_announcement_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  insert into public.kc_conversations(kind,title,created_by)
  values ('group', left(new.title || ' · Announcements', 80), new.owner_id)
  returning id into v_conversation_id;

  insert into public.kc_community_announcements(community_id,conversation_id)
  values (new.id,v_conversation_id);

  insert into public.kc_conversation_members(conversation_id,user_id,role)
  values (v_conversation_id,new.owner_id,'owner')
  on conflict (conversation_id,user_id) do update set role='owner';
  return new;
end;
$$;
revoke all on function private.kc_create_community_announcement_conversation() from public, anon, authenticated;
drop trigger if exists kc_community_announcement_after_insert on public.kc_communities;
create trigger kc_community_announcement_after_insert
after insert on public.kc_communities
for each row execute function private.kc_create_community_announcement_conversation();

create or replace function private.kc_sync_community_announcement_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  if tg_op = 'DELETE' then
    select a.conversation_id into v_conversation_id
    from public.kc_community_announcements a
    where a.community_id = old.community_id;
    if v_conversation_id is not null then
      delete from public.kc_conversation_members
      where conversation_id=v_conversation_id and user_id=old.user_id;
    end if;
    return old;
  end if;

  select a.conversation_id into v_conversation_id
  from public.kc_community_announcements a
  where a.community_id = new.community_id;
  if v_conversation_id is not null then
    insert into public.kc_conversation_members(conversation_id,user_id,role)
    values(v_conversation_id,new.user_id,new.role)
    on conflict(conversation_id,user_id) do update set role=excluded.role;
  end if;
  return new;
end;
$$;
revoke all on function private.kc_sync_community_announcement_membership() from public, anon, authenticated;
drop trigger if exists kc_community_announcement_member_sync on public.kc_community_members;
create trigger kc_community_announcement_member_sync
after insert or update of role or delete on public.kc_community_members
for each row execute function private.kc_sync_community_announcement_membership();

-- Backfill announcement conversations for communities created before this migration.
do $$
declare
  c record;
  v_conversation_id uuid;
begin
  for c in
    select community.id,community.title,community.owner_id
    from public.kc_communities community
    left join public.kc_community_announcements a on a.community_id=community.id
    where a.community_id is null
  loop
    insert into public.kc_conversations(kind,title,created_by)
    values('group',left(c.title || ' · Announcements',80),c.owner_id)
    returning id into v_conversation_id;

    insert into public.kc_community_announcements(community_id,conversation_id)
    values(c.id,v_conversation_id);

    insert into public.kc_conversation_members(conversation_id,user_id,role)
    select v_conversation_id,m.user_id,m.role
    from public.kc_community_members m
    where m.community_id=c.id
    on conflict(conversation_id,user_id) do update set role=excluded.role;

    insert into public.kc_conversation_members(conversation_id,user_id,role)
    values(v_conversation_id,c.owner_id,'owner')
    on conflict(conversation_id,user_id) do update set role='owner';
  end loop;
end;
$$;

-- Enforce announcement posting rights in the database, not just in the UI.
create or replace function private.kc_enforce_community_announcement_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community_id uuid;
begin
  select a.community_id into v_community_id
  from public.kc_community_announcements a
  where a.conversation_id=new.conversation_id;

  if v_community_id is not null then
    if auth.uid() is null or new.sender_id is distinct from auth.uid() then
      raise exception 'Sign in as the message sender to publish an announcement.' using errcode='42501';
    end if;
    if not exists (
      select 1 from public.kc_community_members m
      where m.community_id=v_community_id
        and m.user_id=auth.uid()
        and m.role in ('owner','admin')
    ) then
      raise exception 'Only the community owner or an admin can post announcements.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.kc_enforce_community_announcement_sender() from public, anon, authenticated;
drop trigger if exists kc_community_announcement_message_guard on public.kc_messages;
create trigger kc_community_announcement_message_guard
before insert on public.kc_messages
for each row execute function private.kc_enforce_community_announcement_sender();

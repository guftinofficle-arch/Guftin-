-- LIVEVERSE real-time voice rooms connected to an existing Guftin chat.
create table if not exists public.liveverse_voice_rooms (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null unique references public.liveverse_spaces(id) on delete cascade,
  source_chat_id uuid not null references public.kc_conversations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists liveverse_voice_rooms_chat_status_created_idx
  on public.liveverse_voice_rooms(source_chat_id, status, created_at desc);

alter table public.liveverse_voice_rooms enable row level security;
revoke all on public.liveverse_voice_rooms from public, anon;
grant select, insert, update on public.liveverse_voice_rooms to authenticated;

drop policy if exists liveverse_voice_rooms_non_anonymous on public.liveverse_voice_rooms;
create policy liveverse_voice_rooms_non_anonymous
on public.liveverse_voice_rooms as restrictive
for all to authenticated
using ((select private.liveverse_is_non_anonymous()))
with check ((select private.liveverse_is_non_anonymous()));

drop policy if exists liveverse_voice_rooms_chat_member_read on public.liveverse_voice_rooms;
create policy liveverse_voice_rooms_chat_member_read
on public.liveverse_voice_rooms for select to authenticated
using (
  exists (
    select 1 from public.kc_conversation_members cm
    where cm.conversation_id = source_chat_id
      and cm.user_id = (select auth.uid())
      and cm.hidden_at is null
  )
);

drop policy if exists liveverse_voice_rooms_host_create on public.liveverse_voice_rooms;
create policy liveverse_voice_rooms_host_create
on public.liveverse_voice_rooms for insert to authenticated
with check (
  host_id = (select auth.uid())
  and exists (
    select 1 from public.liveverse_spaces s
    join public.kc_conversation_members cm
      on cm.conversation_id = liveverse_voice_rooms.source_chat_id
     and cm.user_id = (select auth.uid())
     and cm.hidden_at is null
    where s.id = space_id
      and s.owner_id = (select auth.uid())
      and s.source_chat_id = liveverse_voice_rooms.source_chat_id
      and s.archived_at is null
  )
);

drop policy if exists liveverse_voice_rooms_host_update on public.liveverse_voice_rooms;
create policy liveverse_voice_rooms_host_update
on public.liveverse_voice_rooms for update to authenticated
using (host_id = (select auth.uid()) or private.liveverse_is_manager(space_id))
with check (host_id = (select auth.uid()) or private.liveverse_is_manager(space_id));

-- Chat members can join an active voice room only when the room belongs to that chat.
drop policy if exists liveverse_members_add_manager_or_owner on public.liveverse_members;
create policy liveverse_members_add_manager_or_owner
on public.liveverse_members for insert to authenticated
with check (
  (
    role = 'owner'
    and private.liveverse_is_owner(space_id)
    and user_id = (select auth.uid())
  )
  or (
    role = 'member'
    and (
      exists (
        select 1 from public.liveverse_spaces s
        where s.id = space_id and s.owner_id = (select auth.uid())
      )
      or private.liveverse_is_manager(space_id)
      or exists (
        select 1
        from public.liveverse_voice_rooms vr
        join public.kc_conversation_members cm
          on cm.conversation_id = vr.source_chat_id
         and cm.user_id = (select auth.uid())
         and cm.hidden_at is null
        where vr.space_id = liveverse_members.space_id
          and vr.status = 'active'
      )
    )
  )
);

-- Keep room and participant changes visible to users already in the chat.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'liveverse_voice_rooms'
  ) then
    alter publication supabase_realtime add table public.liveverse_voice_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'liveverse_members'
  ) then
    alter publication supabase_realtime add table public.liveverse_members;
  end if;
end $$;

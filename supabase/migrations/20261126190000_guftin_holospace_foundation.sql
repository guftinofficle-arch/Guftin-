-- Guftin HoloSpace: private rooms, memories, gallery, avatars, themes and events.
create schema if not exists private;

create table if not exists public.holospace_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  privacy text not null default 'private' check (privacy in ('private','public')),
  source_chat_id uuid,
  source_chat_kind text check (source_chat_kind in ('direct','group')),
  owner_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.holospace_members (
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  invitation_status text not null default 'active' check (invitation_status in ('invited','active')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table if not exists public.holospace_memories (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  media_path text,
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holospace_gallery (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  object_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')),
  byte_size bigint not null check (byte_size between 1 and 104857600),
  caption text not null default '' check (char_length(caption) <= 500),
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.holospace_avatars (
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_key text not null check (avatar_key in ('orbit','comet','nova','planet','moon','star','nebula','rocket','flower','spark')),
  color_key text not null default 'emerald' check (color_key in ('emerald','ocean','violet','sunset','gold','rose')),
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table if not exists public.holospace_themes (
  room_id uuid primary key references public.holospace_rooms(id) on delete cascade,
  theme_key text not null default 'aurora' check (theme_key in ('aurora','midnight','ocean','sunset','forest','starlight')),
  background_path text,
  accent_color text not null default '#0B9B72' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.holospace_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  event_type text not null default 'special_date' check (event_type in ('birthday','special_date','countdown')),
  starts_at timestamptz not null,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holospace_activity (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.holospace_rooms(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  activity_type text not null check (activity_type in ('room.created','member.invited','member.joined','member.left','memory.added','memory.updated','memory.deleted','gallery.added','gallery.deleted','avatar.updated','theme.updated','event.created','event.updated','event.deleted')),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 12000),
  created_at timestamptz not null default now(),
  unique(room_id,actor_id,client_event_id)
);

create index if not exists holospace_rooms_owner_updated_idx on public.holospace_rooms(owner_id,updated_at desc);
create index if not exists holospace_members_user_idx on public.holospace_members(user_id,invitation_status,created_at desc);
create index if not exists holospace_memories_room_date_idx on public.holospace_memories(room_id,created_at desc);
create index if not exists holospace_gallery_room_date_idx on public.holospace_gallery(room_id,created_at desc);
create index if not exists holospace_events_room_date_idx on public.holospace_events(room_id,starts_at);
create index if not exists holospace_activity_room_date_idx on public.holospace_activity(room_id,created_at desc);

create or replace function private.holospace_is_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.holospace_members m
  where m.room_id=p_room_id and m.user_id=(select auth.uid()) and m.invitation_status='active');
$$;
create or replace function private.holospace_is_owner(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.holospace_rooms r
  where r.id=p_room_id and r.owner_id=(select auth.uid()));
$$;
revoke all on function private.holospace_is_member(uuid) from public,anon;
revoke all on function private.holospace_is_owner(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.holospace_is_member(uuid) to authenticated;
grant execute on function private.holospace_is_owner(uuid) to authenticated;

create or replace function private.holospace_add_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is distinct from new.owner_id then
   raise exception 'HoloSpace owner must match authenticated user';
 end if;
 insert into public.holospace_members(room_id,user_id,role,invitation_status,joined_at)
 values(new.id,new.owner_id,'owner','active',now());
 return new;
end;
$$;
revoke all on function private.holospace_add_owner() from public,anon,authenticated;
drop trigger if exists holospace_room_add_owner on public.holospace_rooms;
create trigger holospace_room_add_owner after insert on public.holospace_rooms
for each row execute function private.holospace_add_owner();

alter table public.holospace_rooms enable row level security;
alter table public.holospace_members enable row level security;
alter table public.holospace_memories enable row level security;
alter table public.holospace_gallery enable row level security;
alter table public.holospace_avatars enable row level security;
alter table public.holospace_themes enable row level security;
alter table public.holospace_events enable row level security;
alter table public.holospace_activity enable row level security;

drop policy if exists holospace_rooms_read on public.holospace_rooms;
create policy holospace_rooms_read on public.holospace_rooms for select to authenticated
using (private.holospace_is_member(id) or (privacy='public' and archived_at is null) or owner_id=(select auth.uid()));
drop policy if exists holospace_rooms_insert on public.holospace_rooms;
create policy holospace_rooms_insert on public.holospace_rooms for insert to authenticated
with check(owner_id=(select auth.uid()));
drop policy if exists holospace_rooms_update on public.holospace_rooms;
create policy holospace_rooms_update on public.holospace_rooms for update to authenticated
using(private.holospace_is_owner(id)) with check(private.holospace_is_owner(id));
drop policy if exists holospace_rooms_delete on public.holospace_rooms;
create policy holospace_rooms_delete on public.holospace_rooms for delete to authenticated
using(private.holospace_is_owner(id));

drop policy if exists holospace_members_read on public.holospace_members;
create policy holospace_members_read on public.holospace_members for select to authenticated
using(private.holospace_is_member(room_id) or user_id=(select auth.uid()) or private.holospace_is_owner(room_id));
drop policy if exists holospace_members_public_join on public.holospace_members;
create policy holospace_members_public_join on public.holospace_members for insert to authenticated
with check (
 user_id=(select auth.uid()) and role='member' and invitation_status='active'
 and exists(select 1 from public.holospace_rooms r where r.id=room_id and r.privacy='public' and r.archived_at is null)
);
drop policy if exists holospace_members_invite on public.holospace_members;
create policy holospace_members_invite on public.holospace_members for insert to authenticated
with check (
 role='member' and invitation_status='invited' and invited_by=(select auth.uid())
 and private.holospace_is_owner(room_id)
);
drop policy if exists holospace_members_accept on public.holospace_members;
create policy holospace_members_accept on public.holospace_members for update to authenticated
using(user_id=(select auth.uid()) and invitation_status='invited')
with check(user_id=(select auth.uid()) and role='member' and invitation_status='active');
drop policy if exists holospace_members_leave on public.holospace_members;
create policy holospace_members_leave on public.holospace_members for delete to authenticated
using(user_id=(select auth.uid()) and role='member' or private.holospace_is_owner(room_id) and user_id<>(select owner_id from public.holospace_rooms r where r.id=room_id));

drop policy if exists holospace_memories_access on public.holospace_memories;
drop policy if exists holospace_memories_read on public.holospace_memories;
create policy holospace_memories_read on public.holospace_memories for select to authenticated
using(private.holospace_is_member(room_id));
drop policy if exists holospace_memories_insert on public.holospace_memories;
create policy holospace_memories_insert on public.holospace_memories for insert to authenticated
with check(private.holospace_is_member(room_id) and author_id=(select auth.uid()));
drop policy if exists holospace_memories_update on public.holospace_memories;
create policy holospace_memories_update on public.holospace_memories for update to authenticated
using(author_id=(select auth.uid()) or private.holospace_is_owner(room_id))
with check(private.holospace_is_member(room_id) and (author_id=(select auth.uid()) or private.holospace_is_owner(room_id)));
drop policy if exists holospace_memories_delete on public.holospace_memories;
create policy holospace_memories_delete on public.holospace_memories for delete to authenticated
using(author_id=(select auth.uid()) or private.holospace_is_owner(room_id));
drop policy if exists holospace_gallery_read on public.holospace_gallery;
create policy holospace_gallery_read on public.holospace_gallery for select to authenticated
using(private.holospace_is_member(room_id));
drop policy if exists holospace_gallery_insert on public.holospace_gallery;
create policy holospace_gallery_insert on public.holospace_gallery for insert to authenticated
with check(private.holospace_is_member(room_id) and uploaded_by=(select auth.uid()) and object_path like room_id::text || '/%');
drop policy if exists holospace_gallery_delete on public.holospace_gallery;
create policy holospace_gallery_delete on public.holospace_gallery for delete to authenticated
using(uploaded_by=(select auth.uid()) or private.holospace_is_owner(room_id));

drop policy if exists holospace_avatars_access on public.holospace_avatars;
create policy holospace_avatars_access on public.holospace_avatars for all to authenticated
using(private.holospace_is_member(room_id))
with check(private.holospace_is_member(room_id) and user_id=(select auth.uid()));
drop policy if exists holospace_themes_read on public.holospace_themes;
create policy holospace_themes_read on public.holospace_themes for select to authenticated
using(private.holospace_is_member(room_id));
drop policy if exists holospace_themes_write on public.holospace_themes;
create policy holospace_themes_write on public.holospace_themes for all to authenticated
using(private.holospace_is_owner(room_id))
with check(private.holospace_is_owner(room_id) and updated_by=(select auth.uid()));
drop policy if exists holospace_events_access on public.holospace_events;
drop policy if exists holospace_events_read on public.holospace_events;
create policy holospace_events_read on public.holospace_events for select to authenticated
using(private.holospace_is_member(room_id));
drop policy if exists holospace_events_insert on public.holospace_events;
create policy holospace_events_insert on public.holospace_events for insert to authenticated
with check(private.holospace_is_member(room_id) and created_by=(select auth.uid()));
drop policy if exists holospace_events_update on public.holospace_events;
create policy holospace_events_update on public.holospace_events for update to authenticated
using(created_by=(select auth.uid()) or private.holospace_is_owner(room_id))
with check(private.holospace_is_member(room_id) and (created_by=(select auth.uid()) or private.holospace_is_owner(room_id)));
drop policy if exists holospace_events_delete on public.holospace_events;
create policy holospace_events_delete on public.holospace_events for delete to authenticated
using(created_by=(select auth.uid()) or private.holospace_is_owner(room_id));
drop policy if exists holospace_activity_read on public.holospace_activity;
create policy holospace_activity_read on public.holospace_activity for select to authenticated
using(private.holospace_is_member(room_id));
drop policy if exists holospace_activity_insert on public.holospace_activity;
create policy holospace_activity_insert on public.holospace_activity for insert to authenticated
with check(private.holospace_is_member(room_id) and actor_id=(select auth.uid()));

grant select,insert,update,delete on public.holospace_rooms to authenticated;
grant select,insert,update,delete on public.holospace_members to authenticated;
grant select,insert,update,delete on public.holospace_memories to authenticated;
grant select,insert,delete on public.holospace_gallery to authenticated;
grant select,insert,update,delete on public.holospace_avatars to authenticated;
grant select,insert,update,delete on public.holospace_themes to authenticated;
grant select,insert,update,delete on public.holospace_events to authenticated;
grant select,insert on public.holospace_activity to authenticated;
grant usage,select on sequence public.holospace_activity_id_seq to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('holospace-gallery','holospace-gallery',false,104857600,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']),
 ('holospace-avatars','holospace-avatars',false,5242880,array['image/png','image/jpeg','image/webp']),
 ('holospace-backgrounds','holospace-backgrounds',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists holospace_gallery_storage_read on storage.objects;
create policy holospace_gallery_storage_read on storage.objects for select to authenticated
using(bucket_id='holospace-gallery' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists holospace_gallery_storage_write on storage.objects;
create policy holospace_gallery_storage_write on storage.objects for insert to authenticated
with check(bucket_id='holospace-gallery' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists holospace_gallery_storage_delete on storage.objects;
create policy holospace_gallery_storage_delete on storage.objects for delete to authenticated
using(bucket_id='holospace-gallery' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) and ((storage.foldername(name))[2]=(select auth.uid())::text or private.holospace_is_owner(((storage.foldername(name))[1])::uuid)) else false end);

drop policy if exists holospace_avatar_storage_access on storage.objects;
create policy holospace_avatar_storage_access on storage.objects for all to authenticated
using(bucket_id='holospace-avatars' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]=(select auth.uid())::text else false end)
with check(bucket_id='holospace-avatars' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]=(select auth.uid())::text else false end);

drop policy if exists holospace_background_storage_read on storage.objects;
create policy holospace_background_storage_read on storage.objects for select to authenticated
using(bucket_id='holospace-backgrounds' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_member(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists holospace_background_storage_write on storage.objects;
create policy holospace_background_storage_write on storage.objects for all to authenticated
using(bucket_id='holospace-backgrounds' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_owner(((storage.foldername(name))[1])::uuid) else false end)
with check(bucket_id='holospace-backgrounds' and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then private.holospace_is_owner(((storage.foldername(name))[1])::uuid) else false end);

do $$
declare t text;
begin
 foreach t in array array['holospace_rooms','holospace_members','holospace_memories','holospace_gallery','holospace_avatars','holospace_themes','holospace_events','holospace_activity'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;

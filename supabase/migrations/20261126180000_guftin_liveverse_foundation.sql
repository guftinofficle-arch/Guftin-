-- Guftin Liveverse foundation
-- Private shared spaces with membership-scoped data access.
create schema if not exists private;

create table if not exists public.liveverse_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  scope text not null default 'chat' check (scope in ('chat','group')),
  source_chat_id uuid,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.liveverse_members (
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (space_id, user_id)
);

create or replace function private.liveverse_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from new.owner_id then
    raise exception 'Liveverse space owner must match the authenticated user';
  end if;
  insert into public.liveverse_members(space_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (space_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.liveverse_add_owner_member() from public, anon, authenticated;
drop trigger if exists liveverse_space_owner_membership on public.liveverse_spaces;
create trigger liveverse_space_owner_membership
after insert on public.liveverse_spaces
for each row execute function private.liveverse_add_owner_member();

create table if not exists public.liveverse_notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  title text not null default 'Untitled note' check (char_length(title) between 1 and 120),
  content text not null default '' check (char_length(content) <= 100000),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liveverse_tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  details text not null default '' check (char_length(details) <= 4000),
  status text not null default 'open' check (status in ('open','completed')),
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liveverse_canvas (
  space_id uuid primary key references public.liveverse_spaces(id) on delete cascade,
  document jsonb not null default '{"strokes":[]}'::jsonb,
  version bigint not null default 1 check (version > 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.liveverse_media (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  object_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 104857600),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.liveverse_events (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  event_type text not null check (event_type in ('space.created','member.joined','member.left','note.updated','task.created','task.updated','task.deleted','canvas.updated','media.added')),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 16384),
  created_at timestamptz not null default now(),
  unique (space_id, actor_id, client_event_id)
);

create index if not exists liveverse_spaces_owner_updated_idx on public.liveverse_spaces(owner_id, updated_at desc);
create index if not exists liveverse_members_user_idx on public.liveverse_members(user_id, joined_at desc);
create index if not exists liveverse_notes_space_updated_idx on public.liveverse_notes(space_id, updated_at desc);
create index if not exists liveverse_tasks_space_status_idx on public.liveverse_tasks(space_id, status, updated_at desc);
create index if not exists liveverse_media_space_created_idx on public.liveverse_media(space_id, created_at desc);
create index if not exists liveverse_events_space_created_idx on public.liveverse_events(space_id, created_at desc);

-- Membership predicates live outside exposed schemas to avoid RLS recursion.
create or replace function private.liveverse_is_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.liveverse_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.liveverse_is_owner(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.liveverse_spaces s
    where s.id = p_space_id and s.owner_id = (select auth.uid())
  );
$$;

create or replace function private.liveverse_is_manager(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.liveverse_members m
    where m.space_id = p_space_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner','moderator')
  );
$$;

revoke all on function private.liveverse_is_member(uuid) from public, anon;
revoke all on function private.liveverse_is_manager(uuid) from public, anon;
revoke all on function private.liveverse_is_owner(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.liveverse_is_member(uuid) to authenticated;
grant execute on function private.liveverse_is_manager(uuid) to authenticated;
grant execute on function private.liveverse_is_owner(uuid) to authenticated;

alter table public.liveverse_spaces enable row level security;
alter table public.liveverse_members enable row level security;
alter table public.liveverse_notes enable row level security;
alter table public.liveverse_tasks enable row level security;
alter table public.liveverse_canvas enable row level security;
alter table public.liveverse_media enable row level security;
alter table public.liveverse_events enable row level security;

drop policy if exists liveverse_spaces_read_member on public.liveverse_spaces;
create policy liveverse_spaces_read_member on public.liveverse_spaces for select to authenticated
using (private.liveverse_is_member(id) or owner_id = (select auth.uid()));
drop policy if exists liveverse_spaces_create_owner on public.liveverse_spaces;
create policy liveverse_spaces_create_owner on public.liveverse_spaces for insert to authenticated
with check (owner_id = (select auth.uid()));
drop policy if exists liveverse_spaces_update_manager on public.liveverse_spaces;
create policy liveverse_spaces_update_manager on public.liveverse_spaces for update to authenticated
using (private.liveverse_is_manager(id))
with check (private.liveverse_is_manager(id));
drop policy if exists liveverse_spaces_delete_owner on public.liveverse_spaces;
create policy liveverse_spaces_delete_owner on public.liveverse_spaces for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists liveverse_members_read_member on public.liveverse_members;
create policy liveverse_members_read_member on public.liveverse_members for select to authenticated
using (private.liveverse_is_member(space_id) or user_id = (select auth.uid()));
drop policy if exists liveverse_members_add_manager_or_owner on public.liveverse_members;
create policy liveverse_members_add_manager_or_owner on public.liveverse_members for insert to authenticated
with check (
  (role = 'owner' and private.liveverse_is_owner(space_id) and user_id=(select auth.uid()))
  or (role = 'member' and (
    exists (select 1 from public.liveverse_spaces s where s.id = space_id and s.owner_id = (select auth.uid()))
    or private.liveverse_is_manager(space_id)
  ))
);
drop policy if exists liveverse_members_remove_manager_or_self on public.liveverse_members;
create policy liveverse_members_remove_manager_or_self on public.liveverse_members for delete to authenticated
using (
  (user_id = (select auth.uid()) and role <> 'owner')
  or (private.liveverse_is_manager(space_id) and user_id <> (select owner_id from public.liveverse_spaces s where s.id = space_id))
);
drop policy if exists liveverse_members_update_manager on public.liveverse_members;
create policy liveverse_members_update_manager on public.liveverse_members for update to authenticated
using (private.liveverse_is_owner(space_id))
with check (private.liveverse_is_owner(space_id));

drop policy if exists liveverse_notes_member_access on public.liveverse_notes;
create policy liveverse_notes_member_access on public.liveverse_notes for all to authenticated
using (private.liveverse_is_member(space_id))
with check (private.liveverse_is_member(space_id));
drop policy if exists liveverse_tasks_member_access on public.liveverse_tasks;
create policy liveverse_tasks_member_access on public.liveverse_tasks for all to authenticated
using (private.liveverse_is_member(space_id))
with check (private.liveverse_is_member(space_id));
drop policy if exists liveverse_canvas_member_access on public.liveverse_canvas;
create policy liveverse_canvas_member_access on public.liveverse_canvas for all to authenticated
using (private.liveverse_is_member(space_id))
with check (private.liveverse_is_member(space_id));
drop policy if exists liveverse_media_member_read on public.liveverse_media;
create policy liveverse_media_member_read on public.liveverse_media for select to authenticated
using (private.liveverse_is_member(space_id));
drop policy if exists liveverse_media_member_insert on public.liveverse_media;
create policy liveverse_media_member_insert on public.liveverse_media for insert to authenticated
with check (private.liveverse_is_member(space_id) and created_by = (select auth.uid()) and object_path like space_id::text || '/%');
drop policy if exists liveverse_media_manager_delete on public.liveverse_media;
create policy liveverse_media_manager_delete on public.liveverse_media for delete to authenticated
using (created_by = (select auth.uid()) or private.liveverse_is_manager(space_id));
drop policy if exists liveverse_events_member_read on public.liveverse_events;
create policy liveverse_events_member_read on public.liveverse_events for select to authenticated
using (private.liveverse_is_member(space_id));
drop policy if exists liveverse_events_member_insert on public.liveverse_events;
create policy liveverse_events_member_insert on public.liveverse_events for insert to authenticated
with check (private.liveverse_is_member(space_id) and actor_id = (select auth.uid()));

grant select, insert, update, delete on public.liveverse_spaces to authenticated;
grant select, insert, delete on public.liveverse_members to authenticated;
grant select, insert, update, delete on public.liveverse_notes to authenticated;
grant select, insert, update, delete on public.liveverse_tasks to authenticated;
grant select, insert, update, delete on public.liveverse_canvas to authenticated;
grant select, insert, delete on public.liveverse_media to authenticated;
grant select, insert on public.liveverse_events to authenticated;
grant usage, select on sequence public.liveverse_events_id_seq to authenticated;

-- Private bucket; every object path begins with its space UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('liveverse-media','liveverse-media',false,104857600,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists liveverse_storage_read_member on storage.objects;
create policy liveverse_storage_read_member on storage.objects for select to authenticated
using (
  bucket_id = 'liveverse-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.liveverse_is_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);
drop policy if exists liveverse_storage_insert_member on storage.objects;
create policy liveverse_storage_insert_member on storage.objects for insert to authenticated
with check (
  bucket_id = 'liveverse-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.liveverse_is_member(((storage.foldername(name))[1])::uuid)
      and (storage.foldername(name))[2] = (select auth.uid())::text
    else false
  end
);
drop policy if exists liveverse_storage_update_member on storage.objects;
create policy liveverse_storage_update_member on storage.objects for update to authenticated
using (
  bucket_id = 'liveverse-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.liveverse_is_member(((storage.foldername(name))[1])::uuid)
      and (storage.foldername(name))[2] = (select auth.uid())::text
    else false
  end
)
with check (
  bucket_id = 'liveverse-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.liveverse_is_member(((storage.foldername(name))[1])::uuid)
      and (storage.foldername(name))[2] = (select auth.uid())::text
    else false
  end
);
drop policy if exists liveverse_storage_delete_manager on storage.objects;
create policy liveverse_storage_delete_manager on storage.objects for delete to authenticated
using (
  bucket_id = 'liveverse-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (storage.foldername(name))[2] = (select auth.uid())::text
      or private.liveverse_is_manager(((storage.foldername(name))[1])::uuid)
    else false
  end
);

-- Realtime table publication is idempotent. Presence and pointers use ephemeral
-- Realtime Presence/Broadcast channels and are deliberately not written per frame.
do $$
declare t text;
begin
  foreach t in array array[
    'liveverse_spaces','liveverse_members','liveverse_notes',
    'liveverse_tasks','liveverse_canvas','liveverse_media','liveverse_events'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

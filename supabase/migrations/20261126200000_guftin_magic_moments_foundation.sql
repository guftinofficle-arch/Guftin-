-- Guftin Magic Moments: private, member-scoped memories and server-controlled delivery.
-- Apply only after reviewing the schema against the production project.
create extension if not exists pgcrypto;

create table if not exists public.magic_moments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('birthday','capsule','future_message','secret_surprise','together','anniversary')),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  description text not null default '' check (char_length(description) <= 8000),
  conversation_id uuid,
  recipient_id uuid references auth.users(id) on delete set null,
  reveal_at timestamptz,
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  status text not null default 'draft' check (status in ('draft','scheduled','revealed','cancelled','archived')),
  cover_object_path text,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revealed_at timestamptz,
  constraint magic_moment_reveal_after_create check (reveal_at is null or reveal_at > created_at - interval '1 minute')
);

create table if not exists public.magic_moment_members (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.magic_moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','contributor','recipient','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(moment_id,user_id)
);

create or replace function private.magic_moment_add_owner()
returns trigger language plpgsql security definer set search_path = ''
as $
begin
 insert into public.magic_moment_members(moment_id,user_id,role,invited_by,accepted_at)
 values(new.id,new.creator_id,'owner',new.creator_id,now())
 on conflict(moment_id,user_id) do nothing;
 return new;
end;
$;
revoke all on function private.magic_moment_add_owner() from public,anon,authenticated;
drop trigger if exists magic_moment_owner_membership on public.magic_moments;
create trigger magic_moment_owner_membership after insert on public.magic_moments
for each row execute function private.magic_moment_add_owner();

create table if not exists public.magic_moment_items (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.magic_moments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('text','image','video','audio','voice_note','card')),
  body text not null default '' check (char_length(body) <= 20000),
  object_path text,
  mime_type text,
  byte_size bigint not null default 0 check (byte_size between 0 and 52428800),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((item_type in ('text','card') and object_path is null) or item_type not in ('text','card'))
);

create table if not exists public.magic_moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.magic_moments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.magic_moment_reactions (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.magic_moments(id) on delete cascade,
  item_id uuid references public.magic_moment_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('❤️','🎉','✨','👏','😊','💜')),
  created_at timestamptz not null default now(),
  unique(moment_id,item_id,user_id)
);

create table if not exists public.magic_moment_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  moment_id uuid references public.magic_moments(id) on delete cascade,
  scheduled_message_id uuid references public.kc_scheduled_messages(id) on delete cascade,
  notification_type text not null check (notification_type in ('invite','contribution','capsule','scheduled_confirmation','scheduled_delivery','reveal','together','anniversary')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 500),
  safe_payload jsonb not null default '{}'::jsonb check (pg_column_size(safe_payload) <= 4096),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists magic_moments_creator_idx on public.magic_moments(creator_id,updated_at desc);
create index if not exists magic_moment_members_user_idx on public.magic_moment_members(user_id,accepted_at,created_at desc);
create index if not exists magic_moment_items_moment_idx on public.magic_moment_items(moment_id,created_at);
create index if not exists magic_moment_comments_moment_idx on public.magic_moment_comments(moment_id,created_at);
create index if not exists magic_notifications_user_idx on public.magic_moment_notifications(recipient_id,created_at desc);

create or replace function private.magic_moment_is_member(p_moment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.magic_moment_members m where m.moment_id=p_moment_id and m.user_id=(select auth.uid()) and (m.accepted_at is not null or m.role='owner')); $$;
create or replace function private.magic_moment_is_editor(p_moment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.magic_moment_members m where m.moment_id=p_moment_id and m.user_id=(select auth.uid()) and m.role in ('owner','contributor') and (m.accepted_at is not null or m.role='owner')); $$;
create or replace function private.magic_moment_is_owner(p_moment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.magic_moments m where m.id=p_moment_id and m.creator_id=(select auth.uid())); $$;

revoke all on function private.magic_moment_is_member(uuid) from public,anon;
revoke all on function private.magic_moment_is_editor(uuid) from public,anon;
revoke all on function private.magic_moment_is_owner(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.magic_moment_is_member(uuid),private.magic_moment_is_editor(uuid),private.magic_moment_is_owner(uuid) to authenticated;

alter table public.magic_moments enable row level security;
alter table public.magic_moment_members enable row level security;
alter table public.magic_moment_items enable row level security;
alter table public.magic_moment_comments enable row level security;
alter table public.magic_moment_reactions enable row level security;
alter table public.magic_moment_notifications enable row level security;

drop policy if exists magic_moments_member_read on public.magic_moments;
create policy magic_moments_member_read on public.magic_moments for select to authenticated using (
 creator_id=(select auth.uid()) or (
  private.magic_moment_is_member(id) and (
   kind not in ('secret_surprise','birthday','future_message') or recipient_id is distinct from (select auth.uid()) or (kind='future_message' and status not in ('scheduled','draft')) or (kind<>'future_message' and (reveal_at is null or reveal_at<=now() or status='revealed'))
  )
 )
);
drop policy if exists magic_moments_creator_insert on public.magic_moments;
create policy magic_moments_creator_insert on public.magic_moments for insert to authenticated with check (creator_id=(select auth.uid()));
drop policy if exists magic_moments_creator_update on public.magic_moments;
create policy magic_moments_creator_update on public.magic_moments for update to authenticated using (creator_id=(select auth.uid())) with check (creator_id=(select auth.uid()));
drop policy if exists magic_moments_creator_delete on public.magic_moments;
create policy magic_moments_creator_delete on public.magic_moments for delete to authenticated using (creator_id=(select auth.uid()));

drop policy if exists magic_members_read_related on public.magic_moment_members;
create policy magic_members_read_related on public.magic_moment_members for select to authenticated using (user_id=(select auth.uid()) or private.magic_moment_is_owner(moment_id) or private.magic_moment_is_member(moment_id));
drop policy if exists magic_members_owner_invite on public.magic_moment_members;
create policy magic_members_owner_invite on public.magic_moment_members for insert to authenticated with check (private.magic_moment_is_owner(moment_id) and invited_by=(select auth.uid()) and role in ('contributor','recipient','viewer'));
drop policy if exists magic_members_owner_update on public.magic_moment_members;
create policy magic_members_owner_update on public.magic_moment_members for update to authenticated using (private.magic_moment_is_owner(moment_id)) with check (private.magic_moment_is_owner(moment_id));
drop policy if exists magic_members_self_accept on public.magic_moment_members;
create policy magic_members_self_accept on public.magic_moment_members for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and role in ('contributor','recipient','viewer'));
drop policy if exists magic_members_owner_remove on public.magic_moment_members;
create policy magic_members_owner_remove on public.magic_moment_members for delete to authenticated using (private.magic_moment_is_owner(moment_id) or user_id=(select auth.uid()));

drop policy if exists magic_items_read_member on public.magic_moment_items;
create policy magic_items_read_member on public.magic_moment_items for select to authenticated using (
 private.magic_moment_is_member(moment_id) and exists(
  select 1 from public.magic_moments mm where mm.id=moment_id and (
   mm.kind not in ('secret_surprise','birthday','future_message') or mm.recipient_id is distinct from (select auth.uid()) or (mm.kind='future_message' and mm.status not in ('scheduled','draft')) or (mm.kind<>'future_message' and (mm.reveal_at is null or mm.reveal_at<=now() or mm.status='revealed'))
  )
 )
);
drop policy if exists magic_items_contributor_insert on public.magic_moment_items;
create policy magic_items_contributor_insert on public.magic_moment_items for insert to authenticated with check (author_id=(select auth.uid()) and private.magic_moment_is_editor(moment_id));
drop policy if exists magic_items_author_update on public.magic_moment_items;
create policy magic_items_author_update on public.magic_moment_items for update to authenticated using (author_id=(select auth.uid()) and private.magic_moment_is_editor(moment_id)) with check (author_id=(select auth.uid()) and private.magic_moment_is_editor(moment_id));
drop policy if exists magic_items_author_delete on public.magic_moment_items;
create policy magic_items_author_delete on public.magic_moment_items for delete to authenticated using (author_id=(select auth.uid()) and private.magic_moment_is_editor(moment_id));

drop policy if exists magic_comments_member_access on public.magic_moment_comments;
create policy magic_comments_member_access on public.magic_moment_comments for select to authenticated using (
 private.magic_moment_is_member(moment_id) and exists(
  select 1 from public.magic_moments mm where mm.id=moment_id and (
   mm.kind not in ('secret_surprise','birthday','future_message') or mm.recipient_id is distinct from (select auth.uid()) or
   (mm.kind='future_message' and mm.status not in ('scheduled','draft')) or
   (mm.kind<>'future_message' and (mm.reveal_at is null or mm.reveal_at<=now() or mm.status='revealed'))
  )
 )
);
create policy magic_comments_insert on public.magic_moment_comments for insert to authenticated with check (author_id=(select auth.uid()) and private.magic_moment_is_member(moment_id));
drop policy if exists magic_reactions_member_read on public.magic_moment_reactions;
create policy magic_reactions_member_read on public.magic_moment_reactions for select to authenticated using (
 private.magic_moment_is_member(moment_id) and exists(
  select 1 from public.magic_moments mm where mm.id=moment_id and (
   mm.kind not in ('secret_surprise','birthday','future_message') or mm.recipient_id is distinct from (select auth.uid()) or
   (mm.kind='future_message' and mm.status not in ('scheduled','draft')) or
   (mm.kind<>'future_message' and (mm.reveal_at is null or mm.reveal_at<=now() or mm.status='revealed'))
  )
 )
);
create policy magic_reactions_self_write on public.magic_moment_reactions for all to authenticated using (user_id=(select auth.uid()) and private.magic_moment_is_member(moment_id)) with check (user_id=(select auth.uid()) and private.magic_moment_is_member(moment_id));

drop policy if exists magic_notifications_read_own on public.magic_moment_notifications;
create policy magic_notifications_read_own on public.magic_moment_notifications for select to authenticated using (recipient_id=(select auth.uid()));
drop policy if exists magic_notifications_update_own on public.magic_moment_notifications;
create policy magic_notifications_update_own on public.magic_moment_notifications for update to authenticated using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));
-- No client INSERT/DELETE policies for notifications: only trusted backend code may create them.

grant select,insert,delete on public.magic_moments,public.magic_moment_members,public.magic_moment_items,public.magic_moment_comments,public.magic_moment_reactions,public.magic_moment_notifications to authenticated;
revoke update on public.magic_moments,public.magic_moment_members,public.magic_moment_items,public.magic_moment_notifications from authenticated;
grant update(title,description,cover_object_path,settings,updated_at) on public.magic_moments to authenticated;
grant update(accepted_at) on public.magic_moment_members to authenticated;
grant update(body,metadata,updated_at) on public.magic_moment_items to authenticated;
grant update(read_at) on public.magic_moment_notifications to authenticated;

-- Private media bucket; object names begin with moment UUID. Storage RLS ties each path to an accepted member.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('magic-moments','magic-moments',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/webm'])
on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists magic_storage_member_read on storage.objects;
create policy magic_storage_member_read on storage.objects for select to authenticated using (
 bucket_id='magic-moments' and exists (
  select 1 from public.magic_moment_members m
  join public.magic_moments mm on mm.id=m.moment_id
  where m.user_id=(select auth.uid()) and m.moment_id::text=split_part(name,'/',1) and m.accepted_at is not null
    and (mm.kind not in ('secret_surprise','birthday','future_message') or mm.recipient_id is distinct from (select auth.uid()) or
      (mm.kind='future_message' and mm.status not in ('scheduled','draft')) or
      (mm.kind<>'future_message' and (mm.reveal_at is null or mm.reveal_at<=now() or mm.status='revealed')))
 )
);
drop policy if exists magic_storage_member_upload on storage.objects;
create policy magic_storage_member_upload on storage.objects for insert to authenticated with check (
 bucket_id='magic-moments' and exists (
  select 1 from public.magic_moment_members m
  where m.user_id=(select auth.uid()) and m.moment_id::text=split_part(name,'/',1)
    and m.role in ('owner','contributor') and m.accepted_at is not null
 )
);
drop policy if exists magic_storage_author_delete on storage.objects;
create policy magic_storage_author_delete on storage.objects for delete to authenticated using (
 bucket_id='magic-moments' and owner_id=(select auth.uid())::text
);

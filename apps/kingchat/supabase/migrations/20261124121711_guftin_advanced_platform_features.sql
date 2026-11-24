-- Guftin advanced social platform feature data layer.
-- Message content, translation and transcription payloads remain client-encrypted envelopes.
create schema if not exists private;

alter table public.kc_e2ee_devices
  add column if not exists platform text not null default 'unknown',
  add column if not exists last_active_at timestamptz not null default now();

create table if not exists public.kc_user_privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_visibility text not null default 'contacts' check(last_seen_visibility in ('everyone','contacts','nobody','selected')),
  online_visibility text not null default 'contacts' check(online_visibility in ('everyone','contacts','nobody','selected')),
  profile_photo_visibility text not null default 'everyone' check(profile_photo_visibility in ('everyone','contacts','nobody','selected')),
  about_visibility text not null default 'everyone' check(about_visibility in ('everyone','contacts','nobody','selected')),
  read_receipts_enabled boolean not null default true,
  group_invites_visibility text not null default 'contacts' check(group_invites_visibility in ('everyone','contacts','nobody','selected')),
  updated_at timestamptz not null default now()
);
create table if not exists public.kc_privacy_exceptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  setting_key text not null check(setting_key in ('last_seen','online','profile_photo','about','group_invites')),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  is_allowed boolean not null,
  created_at timestamptz not null default now(),
  primary key(user_id,setting_key,target_user_id),
  check(user_id <> target_user_id)
);
create table if not exists public.kc_feature_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  scheduled_messages_enabled boolean not null default true,
  voice_transcription_enabled boolean not null default false,
  automatic_translation_enabled boolean not null default false,
  biometric_lock_enabled boolean not null default false,
  encrypted_backup_enabled boolean not null default false,
  anti_spam_protection_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.kc_encrypted_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  encryption_algorithm text not null default 'XSalsa20-Poly1305',
  wrapped_key_envelope text not null,
  byte_size bigint not null check(byte_size > 0),
  app_version text,
  created_at timestamptz not null default now(),
  check(split_part(object_path,'/',1)=user_id::text)
);
create index if not exists kc_encrypted_backups_user_created_idx on public.kc_encrypted_backups(user_id,created_at desc);

create table if not exists public.kc_message_edit_history (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  previous_body_envelope text not null,
  new_body_envelope text not null,
  edited_at timestamptz not null default now()
);
create index if not exists kc_message_edit_history_message_idx on public.kc_message_edit_history(message_id,edited_at desc);
create table if not exists public.kc_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body_envelope text,
  message_type text not null default 'text' check(message_type in ('text','image','video','audio','file')),
  attachment_path text,
  scheduled_at timestamptz not null,
  delivery_status text not null default 'queued' check(delivery_status in ('queued','processing','sent','cancelled','failed')),
  sent_message_id uuid references public.kc_messages(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(body_envelope is not null or attachment_path is not null)
);
create index if not exists kc_scheduled_messages_due_idx on public.kc_scheduled_messages(scheduled_at) where delivery_status='queued';
create index if not exists kc_scheduled_messages_owner_idx on public.kc_scheduled_messages(sender_id,scheduled_at desc);

create table if not exists public.kc_saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  saved_note text,
  created_at timestamptz not null default now(),
  unique(user_id,message_id)
);
create index if not exists kc_saved_items_user_created_idx on public.kc_saved_items(user_id,created_at desc);
create table if not exists public.kc_chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 40),
  color text not null default 'emerald',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id,title)
);
create table if not exists public.kc_chat_folder_items (
  folder_id uuid not null references public.kc_chat_folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(folder_id,conversation_id)
);
create index if not exists kc_chat_folder_items_user_idx on public.kc_chat_folder_items(user_id,folder_id);

create table if not exists public.kc_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  question_envelope text not null,
  allows_multiple boolean not null default false,
  is_anonymous boolean not null default false,
  expires_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.kc_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.kc_polls(id) on delete cascade,
  option_envelope text not null,
  sort_order integer not null default 0,
  unique(poll_id,id)
);
create table if not exists public.kc_poll_votes (
  poll_id uuid not null references public.kc_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(poll_id,option_id,user_id),
  foreign key(poll_id,option_id) references public.kc_poll_options(poll_id,id) on delete cascade
);
create index if not exists kc_poll_votes_poll_idx on public.kc_poll_votes(poll_id);

create table if not exists public.kc_group_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title_envelope text not null,
  details_envelope text,
  location_envelope text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  reminder_minutes integer not null default 15 check(reminder_minutes between 0 and 10080),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check(ends_at is null or ends_at > starts_at)
);
create index if not exists kc_group_events_conversation_start_idx on public.kc_group_events(conversation_id,starts_at);
create table if not exists public.kc_group_event_rsvps (
  event_id uuid not null references public.kc_group_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check(response in ('going','maybe','not_going')),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.kc_communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 80),
  description_envelope text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.kc_community_members (
  community_id uuid not null references public.kc_communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(community_id,user_id)
);
create table if not exists public.kc_community_groups (
  community_id uuid not null references public.kc_communities(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(community_id,conversation_id),
  unique(conversation_id)
);

create table if not exists public.kc_business_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_name text not null check(length(trim(store_name)) between 1 and 100),
  description text,
  contact_email text,
  currency_code text not null default 'PKR' check(currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.kc_business_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 120),
  description text,
  price numeric(12,2) not null check(price >= 0),
  currency_code text not null default 'PKR' check(currency_code ~ '^[A-Z]{3}$'),
  image_path text,
  availability text not null default 'available' check(availability in ('available','out_of_stock','preorder')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kc_business_products_owner_idx on public.kc_business_products(owner_id,created_at desc);
create table if not exists public.kc_business_quick_replies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shortcut text not null check(length(trim(shortcut)) between 1 and 30),
  reply_text text not null check(length(reply_text) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,shortcut)
);

create table if not exists public.kc_channel_analytics_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  message_id uuid references public.kc_messages(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check(event_type in ('view','reaction','share','follow','unfollow')),
  created_at timestamptz not null default now()
);
create index if not exists kc_channel_analytics_day_idx on public.kc_channel_analytics_events(conversation_id,event_type,created_at);

create table if not exists public.kc_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_user_id),
  check(blocker_id <> blocked_user_id)
);
create table if not exists public.kc_spam_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  message_id uuid references public.kc_messages(id) on delete set null,
  reason text not null check(reason in ('spam','scam','harassment','impersonation','suspicious_link','other')),
  details text,
  status text not null default 'pending' check(status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create table if not exists public.kc_spam_appeals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.kc_spam_reports(id) on delete cascade,
  appellant_id uuid not null references auth.users(id) on delete cascade,
  appeal_text text not null check(length(trim(appeal_text)) between 10 and 3000),
  status text not null default 'pending' check(status in ('pending','reviewing','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(report_id,appellant_id)
);

create table if not exists public.kc_message_transcriptions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_envelope text not null,
  language_code text,
  created_at timestamptz not null default now(),
  unique(message_id,user_id)
);
create table if not exists public.kc_message_translations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_language text not null check(target_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  translation_envelope text not null,
  created_at timestamptz not null default now(),
  unique(message_id,user_id,target_language)
);

create or replace function private.kc_is_group_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.kc_conversation_members m
 join public.kc_conversations c on c.id=m.conversation_id
 where m.conversation_id=p_conversation_id and m.user_id=(select auth.uid()) and c.kind='group');
$$;
create or replace function private.kc_is_group_admin(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.kc_conversations c where c.id=p_conversation_id and c.kind='group' and c.created_by=(select auth.uid()))
 or exists(select 1 from public.kc_conversation_members m where m.conversation_id=p_conversation_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'));
$$;
create or replace function private.kc_is_channel_admin(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.kc_channels c where c.conversation_id=p_conversation_id and c.owner_id=(select auth.uid()))
 or exists(select 1 from public.kc_channel_members m where m.conversation_id=p_conversation_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'));
$$;
create or replace function private.kc_is_community_member(p_community_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.kc_community_members m where m.community_id=p_community_id and m.user_id=(select auth.uid()));
$$;
create or replace function private.kc_is_community_admin(p_community_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.kc_communities c where c.id=p_community_id and c.owner_id=(select auth.uid()))
 or exists(select 1 from public.kc_community_members m where m.community_id=p_community_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin'));
$$;
grant usage on schema private to authenticated;
revoke all on function private.kc_is_group_member(uuid),private.kc_is_group_admin(uuid),private.kc_is_channel_admin(uuid),private.kc_is_community_member(uuid),private.kc_is_community_admin(uuid) from public,anon;
grant execute on function private.kc_is_group_member(uuid),private.kc_is_group_admin(uuid),private.kc_is_channel_admin(uuid),private.kc_is_community_member(uuid),private.kc_is_community_admin(uuid) to authenticated;

create or replace function private.kc_record_message_edit()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.body is distinct from old.body and (select auth.uid()) is not null then
  insert into public.kc_message_edit_history(message_id,editor_id,previous_body_envelope,new_body_envelope)
  values(old.id,(select auth.uid()),old.body,new.body);
 end if;
 return new;
end;
$$;
revoke all on function private.kc_record_message_edit() from public,anon,authenticated;
drop trigger if exists kc_messages_record_edit_history on public.kc_messages;
create trigger kc_messages_record_edit_history after update of body on public.kc_messages for each row execute function private.kc_record_message_edit();

create or replace function private.kc_guard_poll_vote()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_multiple boolean;
begin
 select p.allows_multiple into v_multiple from public.kc_polls p where p.id=new.poll_id;
 if not found then raise exception 'Poll not found'; end if;
 if not exists(select 1 from public.kc_poll_options o where o.id=new.option_id and o.poll_id=new.poll_id) then raise exception 'Poll option does not belong to this poll'; end if;
 if not v_multiple and exists(select 1 from public.kc_poll_votes v where v.poll_id=new.poll_id and v.user_id=new.user_id) then raise exception 'This poll accepts only one option per participant'; end if;
 return new;
end;
$$;
revoke all on function private.kc_guard_poll_vote() from public,anon,authenticated;
drop trigger if exists kc_poll_votes_guard on public.kc_poll_votes;
create trigger kc_poll_votes_guard before insert on public.kc_poll_votes for each row execute function private.kc_guard_poll_vote();

alter table public.kc_user_privacy_settings enable row level security;
alter table public.kc_privacy_exceptions enable row level security;
alter table public.kc_feature_preferences enable row level security;
alter table public.kc_encrypted_backups enable row level security;
alter table public.kc_message_edit_history enable row level security;
alter table public.kc_scheduled_messages enable row level security;
alter table public.kc_saved_items enable row level security;
alter table public.kc_chat_folders enable row level security;
alter table public.kc_chat_folder_items enable row level security;
alter table public.kc_polls enable row level security;
alter table public.kc_poll_options enable row level security;
alter table public.kc_poll_votes enable row level security;
alter table public.kc_group_events enable row level security;
alter table public.kc_group_event_rsvps enable row level security;
alter table public.kc_communities enable row level security;
alter table public.kc_community_members enable row level security;
alter table public.kc_community_groups enable row level security;
alter table public.kc_business_profiles enable row level security;
alter table public.kc_business_products enable row level security;
alter table public.kc_business_quick_replies enable row level security;
alter table public.kc_channel_analytics_events enable row level security;
alter table public.kc_user_blocks enable row level security;
alter table public.kc_spam_reports enable row level security;
alter table public.kc_spam_appeals enable row level security;
alter table public.kc_message_transcriptions enable row level security;
alter table public.kc_message_translations enable row level security;

create policy kc_privacy_settings_self on public.kc_user_privacy_settings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_privacy_exceptions_self on public.kc_privacy_exceptions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_feature_preferences_self on public.kc_feature_preferences for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_encrypted_backups_self_read on public.kc_encrypted_backups for select to authenticated using(user_id=(select auth.uid()));
create policy kc_encrypted_backups_self_insert on public.kc_encrypted_backups for insert to authenticated with check(user_id=(select auth.uid()) and split_part(object_path,'/',1)=(select auth.uid())::text);
create policy kc_encrypted_backups_self_delete on public.kc_encrypted_backups for delete to authenticated using(user_id=(select auth.uid()));
create policy kc_message_edit_history_member_read on public.kc_message_edit_history for select to authenticated using(exists(select 1 from public.kc_messages m where m.id=message_id and public.kc_is_conversation_member(m.conversation_id)));
create policy kc_scheduled_messages_owner_read on public.kc_scheduled_messages for select to authenticated using(sender_id=(select auth.uid()));
create policy kc_scheduled_messages_owner_insert on public.kc_scheduled_messages for insert to authenticated with check(sender_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id));
create policy kc_scheduled_messages_owner_update on public.kc_scheduled_messages for update to authenticated using(sender_id=(select auth.uid()) and delivery_status in ('queued','failed')) with check(sender_id=(select auth.uid()) and delivery_status in ('queued','cancelled','failed'));
create policy kc_scheduled_messages_owner_delete on public.kc_scheduled_messages for delete to authenticated using(sender_id=(select auth.uid()) and delivery_status in ('queued','cancelled','failed'));
create policy kc_saved_items_self on public.kc_saved_items for all to authenticated using(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)) with check(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id));
create policy kc_chat_folders_self on public.kc_chat_folders for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_chat_folder_items_self on public.kc_chat_folder_items for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.kc_chat_folders f where f.id=folder_id and f.user_id=(select auth.uid())) and public.kc_is_conversation_member(conversation_id)) with check(user_id=(select auth.uid()) and exists(select 1 from public.kc_chat_folders f where f.id=folder_id and f.user_id=(select auth.uid())) and public.kc_is_conversation_member(conversation_id));
create policy kc_polls_member_read on public.kc_polls for select to authenticated using(public.kc_is_conversation_member(conversation_id));
create policy kc_polls_group_create on public.kc_polls for insert to authenticated with check(creator_id=(select auth.uid()) and private.kc_is_group_member(conversation_id));
create policy kc_polls_creator_update on public.kc_polls for update to authenticated using(creator_id=(select auth.uid()) or private.kc_is_group_admin(conversation_id)) with check(creator_id=(select auth.uid()) or private.kc_is_group_admin(conversation_id));
create policy kc_poll_options_member_read on public.kc_poll_options for select to authenticated using(exists(select 1 from public.kc_polls p where p.id=poll_id and public.kc_is_conversation_member(p.conversation_id)));
create policy kc_poll_options_creator_insert on public.kc_poll_options for insert to authenticated with check(exists(select 1 from public.kc_polls p where p.id=poll_id and p.creator_id=(select auth.uid())));
create policy kc_poll_votes_member_read on public.kc_poll_votes for select to authenticated using(exists(select 1 from public.kc_polls p where p.id=poll_id and public.kc_is_conversation_member(p.conversation_id)));
create policy kc_poll_votes_member_insert on public.kc_poll_votes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.kc_polls p where p.id=poll_id and p.closed_at is null and (p.expires_at is null or p.expires_at>now()) and public.kc_is_conversation_member(p.conversation_id)));
create policy kc_group_events_member_read on public.kc_group_events for select to authenticated using(private.kc_is_group_member(conversation_id));
create policy kc_group_events_member_create on public.kc_group_events for insert to authenticated with check(creator_id=(select auth.uid()) and private.kc_is_group_member(conversation_id));
create policy kc_group_events_admin_update on public.kc_group_events for update to authenticated using(creator_id=(select auth.uid()) or private.kc_is_group_admin(conversation_id)) with check(creator_id=(select auth.uid()) or private.kc_is_group_admin(conversation_id));
create policy kc_group_event_rsvps_member_read on public.kc_group_event_rsvps for select to authenticated using(exists(select 1 from public.kc_group_events e where e.id=event_id and private.kc_is_group_member(e.conversation_id)));
create policy kc_group_event_rsvps_self_write on public.kc_group_event_rsvps for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.kc_group_events e where e.id=event_id and private.kc_is_group_member(e.conversation_id))) with check(user_id=(select auth.uid()) and exists(select 1 from public.kc_group_events e where e.id=event_id and private.kc_is_group_member(e.conversation_id)));
create policy kc_communities_member_read on public.kc_communities for select to authenticated using(owner_id=(select auth.uid()) or private.kc_is_community_member(id));
create policy kc_communities_owner_create on public.kc_communities for insert to authenticated with check(owner_id=(select auth.uid()));
create policy kc_communities_admin_update on public.kc_communities for update to authenticated using(private.kc_is_community_admin(id)) with check(private.kc_is_community_admin(id));
create policy kc_community_members_read on public.kc_community_members for select to authenticated using(private.kc_is_community_member(community_id));
create policy kc_community_members_admin_insert on public.kc_community_members for insert to authenticated with check(private.kc_is_community_admin(community_id) or (user_id=(select auth.uid()) and role='member' and exists(select 1 from public.kc_communities c where c.id=community_id)));
create policy kc_community_members_admin_update on public.kc_community_members for update to authenticated using(private.kc_is_community_admin(community_id)) with check(private.kc_is_community_admin(community_id) and role in ('admin','member'));
create policy kc_community_members_admin_delete on public.kc_community_members for delete to authenticated using(private.kc_is_community_admin(community_id) and user_id<>(select auth.uid()));
create policy kc_community_groups_member_read on public.kc_community_groups for select to authenticated using(private.kc_is_community_member(community_id));
create policy kc_community_groups_admin_manage on public.kc_community_groups for all to authenticated using(private.kc_is_community_admin(community_id) and private.kc_is_group_admin(conversation_id)) with check(private.kc_is_community_admin(community_id) and private.kc_is_group_admin(conversation_id));
create policy kc_business_profiles_owner_manage on public.kc_business_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_business_products_published_read on public.kc_business_products for select to authenticated using(is_published or owner_id=(select auth.uid()));
create policy kc_business_products_owner_insert on public.kc_business_products for insert to authenticated with check(owner_id=(select auth.uid()));
create policy kc_business_products_owner_update on public.kc_business_products for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy kc_business_products_owner_delete on public.kc_business_products for delete to authenticated using(owner_id=(select auth.uid()));
create policy kc_business_quick_replies_self on public.kc_business_quick_replies for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy kc_channel_analytics_member_insert on public.kc_channel_analytics_events for insert to authenticated with check(actor_id=(select auth.uid()) and exists(select 1 from public.kc_conversation_members m where m.conversation_id=kc_channel_analytics_events.conversation_id and m.user_id=(select auth.uid())));
create policy kc_channel_analytics_admin_read on public.kc_channel_analytics_events for select to authenticated using(private.kc_is_channel_admin(conversation_id));
create policy kc_user_blocks_self on public.kc_user_blocks for all to authenticated using(blocker_id=(select auth.uid())) with check(blocker_id=(select auth.uid()));
create policy kc_spam_reports_reporter_read on public.kc_spam_reports for select to authenticated using(reporter_id=(select auth.uid()) or target_user_id=(select auth.uid()));
create policy kc_spam_reports_self_insert on public.kc_spam_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and (target_user_id is null or target_user_id<>(select auth.uid())));
create policy kc_spam_appeals_self_read on public.kc_spam_appeals for select to authenticated using(appellant_id=(select auth.uid()));
create policy kc_spam_appeals_self_insert on public.kc_spam_appeals for insert to authenticated with check(appellant_id=(select auth.uid()) and exists(select 1 from public.kc_spam_reports r where r.id=report_id and r.target_user_id=(select auth.uid())));
create policy kc_message_transcriptions_self on public.kc_message_transcriptions for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.kc_messages m where m.id=message_id and public.kc_is_conversation_member(m.conversation_id))) with check(user_id=(select auth.uid()) and exists(select 1 from public.kc_messages m where m.id=message_id and public.kc_is_conversation_member(m.conversation_id)));
create policy kc_message_translations_self on public.kc_message_translations for all to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.kc_messages m where m.id=message_id and public.kc_is_conversation_member(m.conversation_id))) with check(user_id=(select auth.uid()) and exists(select 1 from public.kc_messages m where m.id=message_id and public.kc_is_conversation_member(m.conversation_id)));

create or replace view public.kc_channel_analytics_summary with(security_invoker=true) as
select conversation_id,date_trunc('day',created_at)::date as event_day,event_type,count(*)::bigint as event_count
from public.kc_channel_analytics_events group by conversation_id,date_trunc('day',created_at)::date,event_type;
grant select on public.kc_channel_analytics_summary to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kc-encrypted-backups','kc-encrypted-backups',false,524288000,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=524288000,allowed_mime_types=array['application/octet-stream'];
create policy kc_backup_storage_owner_insert on storage.objects for insert to authenticated with check(bucket_id='kc-encrypted-backups' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy kc_backup_storage_owner_read on storage.objects for select to authenticated using(bucket_id='kc-encrypted-backups' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy kc_backup_storage_owner_delete on storage.objects for delete to authenticated using(bucket_id='kc-encrypted-backups' and (storage.foldername(name))[1]=(select auth.uid())::text);

grant select,insert,update,delete on
 public.kc_user_privacy_settings,public.kc_privacy_exceptions,public.kc_feature_preferences,
 public.kc_encrypted_backups,public.kc_scheduled_messages,public.kc_saved_items,public.kc_chat_folders,
 public.kc_chat_folder_items,public.kc_polls,public.kc_poll_options,public.kc_poll_votes,
 public.kc_group_events,public.kc_group_event_rsvps,public.kc_communities,public.kc_community_members,
 public.kc_community_groups,public.kc_business_profiles,public.kc_business_products,
 public.kc_business_quick_replies,public.kc_user_blocks,public.kc_spam_reports,public.kc_spam_appeals,
 public.kc_message_transcriptions,public.kc_message_translations to authenticated;
grant select,insert on public.kc_channel_analytics_events to authenticated;
grant select on public.kc_message_edit_history to authenticated;
grant usage,select on sequence public.kc_channel_analytics_events_id_seq to authenticated;

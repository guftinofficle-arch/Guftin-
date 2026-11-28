-- Guftin chat experience: per-chat preferences, group member labels, reactions and reminders.
create table if not exists public.kc_chat_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  notifications_enabled boolean not null default true,
  sound_key text not null default 'default' check (sound_key in ('default','soft','bright','chime','silent')),
  vibration_enabled boolean not null default true,
  show_preview boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(user_id, conversation_id)
);
create table if not exists public.kc_chat_member_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null check(length(trim(tag)) between 1 and 32),
  created_at timestamptz not null default now(),
  unique(user_id, conversation_id, member_user_id, tag),
  check(user_id <> member_user_id)
);
create index if not exists kc_chat_member_tags_lookup_idx on public.kc_chat_member_tags(user_id,conversation_id,member_user_id);
create table if not exists public.kc_message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check(reaction in ('❤️','😂','👍','😮','🔥','👏','🎉','✨','🥳','💯')),
  created_at timestamptz not null default now(),
  unique(message_id,user_id,reaction)
);
create index if not exists kc_message_reactions_message_idx on public.kc_message_reactions(conversation_id,message_id,created_at);
create table if not exists public.kc_message_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  remind_at timestamptz not null,
  note text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  check(remind_at > created_at)
);
create index if not exists kc_message_reminders_due_idx on public.kc_message_reminders(user_id,remind_at) where notified_at is null;

alter table public.kc_chat_preferences enable row level security;
alter table public.kc_chat_member_tags enable row level security;
alter table public.kc_message_reactions enable row level security;
alter table public.kc_message_reminders enable row level security;

drop policy if exists kc_chat_preferences_self on public.kc_chat_preferences;
create policy kc_chat_preferences_self on public.kc_chat_preferences
 for all to authenticated
 using(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id))
 with check(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id));

drop policy if exists kc_chat_member_tags_self on public.kc_chat_member_tags;
create policy kc_chat_member_tags_self on public.kc_chat_member_tags
 for all to authenticated
 using(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_conversation_members m where m.conversation_id=kc_chat_member_tags.conversation_id and m.user_id=kc_chat_member_tags.member_user_id))
 with check(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_conversation_members m where m.conversation_id=kc_chat_member_tags.conversation_id and m.user_id=kc_chat_member_tags.member_user_id));

drop policy if exists kc_message_reactions_member_read on public.kc_message_reactions;
create policy kc_message_reactions_member_read on public.kc_message_reactions
 for select to authenticated using(public.kc_is_conversation_member(conversation_id));
drop policy if exists kc_message_reactions_member_insert on public.kc_message_reactions;
create policy kc_message_reactions_member_insert on public.kc_message_reactions
 for insert to authenticated with check(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_messages m where m.id=message_id and m.conversation_id=kc_message_reactions.conversation_id));
drop policy if exists kc_message_reactions_self_delete on public.kc_message_reactions;
create policy kc_message_reactions_self_delete on public.kc_message_reactions
 for delete to authenticated using(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id));

drop policy if exists kc_message_reminders_self on public.kc_message_reminders;
create policy kc_message_reminders_self on public.kc_message_reminders
 for all to authenticated
 using(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id))
 with check(user_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_messages m where m.id=message_id and m.conversation_id=kc_message_reminders.conversation_id));

grant select,insert,update,delete on public.kc_chat_preferences,public.kc_chat_member_tags,public.kc_message_reactions,public.kc_message_reminders to authenticated;

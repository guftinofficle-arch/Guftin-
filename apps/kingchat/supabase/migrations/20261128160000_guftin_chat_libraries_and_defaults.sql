-- Guftin chat experience expansion: default folders, shared group media index,
-- richer message effects/stickers, and LIVEVERSE participation reactions.
-- Existing saved-items, reminders, member-tags, reactions and chat preferences remain in use.

create or replace function public.kc_seed_default_chat_folders(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.kc_chat_folders(user_id,title,color,sort_order)
  values
    (p_user_id,'Unread','#64748b',0),
    (p_user_id,'Friends','#0ea5e9',1),
    (p_user_id,'Groups','#8b5cf6',2),
    (p_user_id,'Important','#f59e0b',3)
  on conflict(user_id,title) do nothing;
end;
$$;

create or replace function public.kc_seed_default_chat_folders_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kc_seed_default_chat_folders(new.id);
  return new;
end;
$$;

drop trigger if exists kc_seed_chat_folders_after_signup on auth.users;
create trigger kc_seed_chat_folders_after_signup
after insert on auth.users
for each row execute function public.kc_seed_default_chat_folders_on_signup();

-- Backfill existing accounts without overwriting user-created folders.
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.kc_seed_default_chat_folders(u.id);
  end loop;
end $$;

-- Chat attachment library metadata; actual files continue to use the existing
-- encrypted media storage and signed-URL access paths.
create table if not exists public.kc_chat_library_items (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  message_id uuid not null references public.kc_messages(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  media_kind text not null check(media_kind in ('image','video','document','link','audio','other')),
  display_name text,
  object_path text,
  link_url text,
  created_at timestamptz not null default now(),
  unique(conversation_id,message_id),
  check(public.kc_is_conversation_member(conversation_id))
);
create index if not exists kc_chat_library_conversation_kind_created_idx
  on public.kc_chat_library_items(conversation_id,media_kind,created_at desc);

alter table public.kc_chat_library_items enable row level security;
drop policy if exists kc_chat_library_member_read on public.kc_chat_library_items;
create policy kc_chat_library_member_read on public.kc_chat_library_items
 for select to authenticated using(public.kc_is_conversation_member(conversation_id));
drop policy if exists kc_chat_library_member_insert on public.kc_chat_library_items;
create policy kc_chat_library_member_insert on public.kc_chat_library_items
 for insert to authenticated with check(added_by=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_messages m where m.id=message_id and m.conversation_id=kc_chat_library_items.conversation_id));
drop policy if exists kc_chat_library_owner_delete on public.kc_chat_library_items;
create policy kc_chat_library_owner_delete on public.kc_chat_library_items
 for delete to authenticated using(added_by=(select auth.uid()) and public.kc_is_conversation_member(conversation_id));
grant select,insert,delete on public.kc_chat_library_items to authenticated;

-- Custom sticker metadata is user-owned; sticker binaries should be stored in
-- a private storage bucket and accessed through signed URLs.
create table if not exists public.kc_custom_stickers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pack_name text not null check(length(trim(pack_name)) between 1 and 48),
  sticker_name text not null check(length(trim(sticker_name)) between 1 and 48),
  object_path text not null,
  is_animated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists kc_custom_stickers_owner_created_idx
  on public.kc_custom_stickers(owner_id,created_at desc);
alter table public.kc_custom_stickers enable row level security;
drop policy if exists kc_custom_stickers_owner_all on public.kc_custom_stickers;
create policy kc_custom_stickers_owner_all on public.kc_custom_stickers
 for all to authenticated using(owner_id=(select auth.uid()))
 with check(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.kc_custom_stickers to authenticated;

-- Optional message presentation metadata; encrypted message content remains untouched.
create table if not exists public.kc_message_effects (
  message_id uuid primary key references public.kc_messages(id) on delete cascade,
  conversation_id uuid not null references public.kc_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  effect_key text not null check(effect_key in ('confetti','hearts','sparkle','fireworks','reveal')),
  created_at timestamptz not null default now()
);
alter table public.kc_message_effects enable row level security;
drop policy if exists kc_message_effects_member_read on public.kc_message_effects;
create policy kc_message_effects_member_read on public.kc_message_effects
 for select to authenticated using(public.kc_is_conversation_member(conversation_id));
drop policy if exists kc_message_effects_sender_write on public.kc_message_effects;
create policy kc_message_effects_sender_write on public.kc_message_effects
 for all to authenticated using(sender_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id))
 with check(sender_id=(select auth.uid()) and public.kc_is_conversation_member(conversation_id)
   and exists(select 1 from public.kc_messages m where m.id=message_id and m.conversation_id=kc_message_effects.conversation_id and m.sender_id=(select auth.uid())));
grant select,insert,update,delete on public.kc_message_effects to authenticated;

-- Lightweight reactions for LIVEVERSE voice rooms and live activity cards.
create table if not exists public.liveverse_reactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.liveverse_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check(reaction in ('❤️','👏','🔥','🎉','😂','✨','🙌','💯')),
  created_at timestamptz not null default now()
);
create index if not exists liveverse_reactions_space_created_idx
  on public.liveverse_reactions(space_id,created_at desc);
alter table public.liveverse_reactions enable row level security;
drop policy if exists liveverse_reactions_member_read on public.liveverse_reactions;
create policy liveverse_reactions_member_read on public.liveverse_reactions
 for select to authenticated using(exists(
   select 1 from public.liveverse_members m where m.space_id=liveverse_reactions.space_id and m.user_id=(select auth.uid())
 ));
drop policy if exists liveverse_reactions_member_insert on public.liveverse_reactions;
create policy liveverse_reactions_member_insert on public.liveverse_reactions
 for insert to authenticated with check(user_id=(select auth.uid()) and exists(
   select 1 from public.liveverse_members m where m.space_id=liveverse_reactions.space_id and m.user_id=(select auth.uid())
 ));
grant select,insert on public.liveverse_reactions to authenticated;

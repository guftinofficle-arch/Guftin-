-- Secure message deletion and owner-controlled group administration.
create or replace function public.kc_delete_message_for_everyone(p_message_id uuid)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare v_sender uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select sender_id into v_sender from public.kc_messages where id=p_message_id;
  if not found then return; end if;
  if v_sender is distinct from auth.uid() then
    raise exception 'Only the message sender can delete this message for everyone.';
  end if;
  delete from public.kc_messages where id=p_message_id and sender_id=auth.uid();
end;
$$;
revoke all on function public.kc_delete_message_for_everyone(uuid) from public, anon;
grant execute on function public.kc_delete_message_for_everyone(uuid) to authenticated;

create or replace function public.kc_update_group_details(p_conversation_id uuid,p_title text default null,p_photo_url text default null)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare v_owner uuid; v_role text; v_kind text;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select created_by,kind into v_owner,v_kind from public.kc_conversations where id=p_conversation_id;
  if v_kind is distinct from 'group' then raise exception 'This is not a group conversation.'; end if;
  select role into v_role from public.kc_conversation_members where conversation_id=p_conversation_id and user_id=auth.uid();
  if auth.uid() is distinct from v_owner and coalesce(v_role,'member') not in ('owner','admin') then
    raise exception 'Only the group owner or an admin can change group details.';
  end if;
  update public.kc_conversations set
    title=case when p_title is null then title else left(trim(p_title),60) end,
    photo_url=case when p_photo_url is null then photo_url else p_photo_url end,
    updated_at=now()
  where id=p_conversation_id;
end;
$$;
revoke all on function public.kc_update_group_details(uuid,text,text) from public, anon;
grant execute on function public.kc_update_group_details(uuid,text,text) to authenticated;

create or replace function public.kc_set_group_admin(p_conversation_id uuid,p_member_id uuid,p_make_admin boolean)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare v_owner uuid; v_kind text;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select created_by,kind into v_owner,v_kind from public.kc_conversations where id=p_conversation_id;
  if v_kind is distinct from 'group' then raise exception 'This is not a group.'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'Only the owner can assign or remove admins.'; end if;
  if not exists(select 1 from public.kc_conversation_members where conversation_id=p_conversation_id and user_id=p_member_id) then
    raise exception 'That person is not a member of this group.';
  end if;
  if p_member_id=v_owner then raise exception 'The owner role cannot be changed here.'; end if;
  update public.kc_conversation_members set role=case when p_make_admin then 'admin' else 'member' end
  where conversation_id=p_conversation_id and user_id=p_member_id;
end;
$$;
revoke all on function public.kc_set_group_admin(uuid,uuid,boolean) from public, anon;
grant execute on function public.kc_set_group_admin(uuid,uuid,boolean) to authenticated;

create or replace function public.kc_transfer_group_ownership(p_conversation_id uuid,p_new_owner_id uuid,p_keep_old_owner_admin boolean default true)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare v_owner uuid; v_kind text;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  select created_by,kind into v_owner,v_kind from public.kc_conversations where id=p_conversation_id for update;
  if v_kind is distinct from 'group' then raise exception 'This is not a group.'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'Only the current owner can transfer ownership.'; end if;
  if p_new_owner_id=v_owner then raise exception 'Choose another group member.'; end if;
  if not exists(select 1 from public.kc_conversation_members where conversation_id=p_conversation_id and user_id=p_new_owner_id) then
    raise exception 'The new owner must already be a group member.';
  end if;
  update public.kc_conversation_members set role=case when p_keep_old_owner_admin then 'admin' else 'member' end
  where conversation_id=p_conversation_id and user_id=v_owner;
  update public.kc_conversation_members set role='owner' where conversation_id=p_conversation_id and user_id=p_new_owner_id;
  update public.kc_conversations set created_by=p_new_owner_id,updated_at=now() where id=p_conversation_id;
end;
$$;
revoke all on function public.kc_transfer_group_ownership(uuid,uuid,boolean) from public, anon;
grant execute on function public.kc_transfer_group_ownership(uuid,uuid,boolean) to authenticated;

-- Invoker functions are constrained by these explicit row policies.
drop policy if exists "sender hard delete own message" on public.kc_messages;
create policy "sender hard delete own message" on public.kc_messages
for delete to authenticated using(sender_id=(select auth.uid()));
grant delete on public.kc_messages to authenticated;

drop policy if exists "group owner admin update details" on public.kc_conversations;
create policy "group owner admin update details" on public.kc_conversations
for update to authenticated
using(kind='group' and (created_by=(select auth.uid()) or exists(
  select 1 from public.kc_conversation_members m
  where m.conversation_id=id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')
)))
with check(kind='group' and exists(
  select 1 from public.kc_conversation_members m
  where m.conversation_id=id and m.user_id=created_by and m.role in ('owner','admin')
));
grant update(title,photo_url,updated_at,created_by) on public.kc_conversations to authenticated;

drop policy if exists "group owner manages member roles" on public.kc_conversation_members;
create policy "group owner manages member roles" on public.kc_conversation_members
for update to authenticated
using(exists(select 1 from public.kc_conversations c where c.id=conversation_id and c.kind='group' and c.created_by=(select auth.uid())))
with check(exists(select 1 from public.kc_conversations c where c.id=conversation_id and c.kind='group' and c.created_by=(select auth.uid())));
grant update(role) on public.kc_conversation_members to authenticated;

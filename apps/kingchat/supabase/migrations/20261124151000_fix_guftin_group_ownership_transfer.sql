-- Allow the previous owner to complete the ownership transfer atomically.
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

create or replace function public.kc_transfer_group_ownership(p_conversation_id uuid,p_new_owner_id uuid,p_keep_old_owner_admin boolean default true)
returns void language plpgsql security invoker set search_path=public as $$
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

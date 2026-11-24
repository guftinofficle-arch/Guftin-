-- Tighten encrypted message edit validation and membership checks.
create or replace function public.kc_edit_message(
  p_message_id uuid,
  p_new_body_envelope text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid;
  v_conversation_id uuid;
  v_created_at timestamptz;
  v_message_type text;
  v_deleted_at timestamptz;
  v_edited_at timestamptz;
  v_envelope jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;
  if p_new_body_envelope is null or left(p_new_body_envelope, 9) <> 'KC-E2EE1:' then
    raise exception 'Message edits must use Guftin end-to-end encryption.';
  end if;
  begin
    v_envelope := substring(p_new_body_envelope from 10)::jsonb;
  exception when others then
    raise exception 'The encrypted message envelope is invalid.';
  end;
  if v_envelope->>'version' <> '1'
     or v_envelope->>'algorithm' <> 'X25519-XSalsa20-Poly1305'
     or jsonb_typeof(v_envelope->'recipients') is distinct from 'object'
     or v_envelope->'recipients' = '{}'::jsonb then
    raise exception 'The encrypted message envelope is invalid.';
  end if;

  select m.sender_id, m.conversation_id, m.created_at, m.message_type, m.deleted_at
    into v_sender_id, v_conversation_id, v_created_at, v_message_type, v_deleted_at
  from public.kc_messages m
  where m.id = p_message_id
  for update;
  if not found then raise exception 'Message not found.'; end if;
  if v_sender_id is distinct from auth.uid() then raise exception 'Only the original sender can edit this message.'; end if;
  if not exists (
    select 1 from public.kc_conversation_members cm
    where cm.conversation_id = v_conversation_id and cm.user_id = auth.uid()
  ) then
    raise exception 'You are no longer a member of this conversation.';
  end if;
  if v_message_type is distinct from 'text' then raise exception 'Only text messages can be edited.'; end if;
  if v_deleted_at is not null then raise exception 'Deleted messages cannot be edited.'; end if;
  if v_created_at < now() - interval '15 minutes' then raise exception 'Messages can only be edited for 15 minutes after sending.'; end if;

  update public.kc_messages
  set body = p_new_body_envelope, edited_at = now()
  where id = p_message_id
  returning edited_at into v_edited_at;
  return v_edited_at;
end;
$$;
revoke all on function public.kc_edit_message(uuid, text) from public, anon;
grant execute on function public.kc_edit_message(uuid, text) to authenticated;

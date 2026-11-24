-- Server-side delivery for end-to-end encrypted scheduled messages.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.kc_process_scheduled_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_envelope jsonb;
  v_message_id uuid;
  v_prefix text;
  v_sent integer := 0;
begin
  for v_job in
    select s.*
    from public.kc_scheduled_messages s
    where s.delivery_status = 'queued'
      and s.scheduled_at <= clock_timestamp()
    order by s.scheduled_at, s.created_at
    limit 50
    for update skip locked
  loop
    begin
      update public.kc_scheduled_messages
      set delivery_status = 'processing', updated_at = clock_timestamp(), last_error = null
      where id = v_job.id;

      if not exists (
        select 1 from public.kc_conversation_members cm
        where cm.conversation_id = v_job.conversation_id
          and cm.user_id = v_job.sender_id
      ) then
        raise exception 'Sender is no longer a member of this conversation.';
      end if;

      if v_job.message_type = 'text' then
        v_prefix := 'KC-E2EE1:';
        if v_job.body_envelope is null or left(v_job.body_envelope, length(v_prefix)) <> v_prefix
           or v_job.attachment_path is not null then
          raise exception 'Scheduled text must contain an encrypted text envelope only.';
        end if;
      else
        v_prefix := 'KC-MEDIA1:';
        if v_job.body_envelope is null or left(v_job.body_envelope, length(v_prefix)) <> v_prefix
           or v_job.attachment_path is null
           or left(v_job.attachment_path, length(v_job.sender_id::text) + 1) <> (v_job.sender_id::text || '/')
        then
          raise exception 'Scheduled media must contain an encrypted media envelope and the sender-owned object path.';
        end if;
        if not exists (
          select 1 from storage.objects so
          where so.bucket_id = 'chat-media' and so.name = v_job.attachment_path
        ) then
          raise exception 'The encrypted media attachment is no longer available.';
        end if;
      end if;

      begin
        v_envelope := substring(v_job.body_envelope from length(v_prefix) + 1)::jsonb;
      exception when others then
        raise exception 'The encrypted message envelope is invalid JSON.';
      end;

      if v_envelope->>'version' <> '1'
         or jsonb_typeof(v_envelope->'recipients') is distinct from 'object'
         or v_envelope->'recipients' = '{}'::jsonb then
        raise exception 'The encrypted message envelope has an unsupported format.';
      end if;
      if v_job.message_type = 'text'
         and v_envelope->>'algorithm' <> 'X25519-XSalsa20-Poly1305' then
        raise exception 'The text message encryption algorithm is not supported.';
      end if;
      if v_job.message_type <> 'text'
         and (v_envelope->>'algorithm' <> 'XSalsa20-Poly1305'
           or v_envelope->>'keyAgreement' <> 'X25519-XSalsa20-Poly1305') then
        raise exception 'The media encryption algorithm is not supported.';
      end if;

      if exists (
        select 1
        from public.kc_conversation_members cm
        where cm.conversation_id = v_job.conversation_id
          and not exists (
            select 1 from public.kc_e2ee_devices d
            where d.user_id = cm.user_id and d.revoked_at is null
          )
      ) then
        raise exception 'A conversation member has no active encryption device. Please recreate the scheduled message.';
      end if;

      if exists (
        select 1
        from public.kc_conversation_members cm
        join public.kc_e2ee_devices d on d.user_id = cm.user_id and d.revoked_at is null
        where cm.conversation_id = v_job.conversation_id
          and not (v_envelope->'recipients' ? d.id::text)
      ) then
        raise exception 'The encryption device roster changed after scheduling. Please recreate this message.';
      end if;

      if exists (
        select 1
        from jsonb_object_keys(v_envelope->'recipients') as recipient(device_id)
        left join public.kc_e2ee_devices d
          on d.id::text = recipient.device_id and d.revoked_at is null
        left join public.kc_conversation_members cm
          on cm.conversation_id = v_job.conversation_id and cm.user_id = d.user_id
        where d.id is null or cm.user_id is null
      ) then
        raise exception 'The scheduled message contains a revoked or unrelated encryption recipient.';
      end if;

      if exists (
        select 1
        from public.kc_conversations c
        join public.kc_conversation_members cm
          on cm.conversation_id = c.id and cm.user_id <> v_job.sender_id
        join public.kc_user_blocks b
          on (b.blocker_id = cm.user_id and b.blocked_user_id = v_job.sender_id)
          or (b.blocker_id = v_job.sender_id and b.blocked_user_id = cm.user_id)
        where c.id = v_job.conversation_id and c.kind = 'direct'
      ) then
        raise exception 'A block is active between the participants; the message was not delivered.';
      end if;

      insert into public.kc_messages(
        conversation_id, sender_id, body, message_type, attachment_url
      ) values (
        v_job.conversation_id, v_job.sender_id, v_job.body_envelope,
        v_job.message_type, v_job.attachment_path
      )
      returning id into v_message_id;

      update public.kc_scheduled_messages
      set delivery_status = 'sent',
          sent_message_id = v_message_id,
          updated_at = clock_timestamp(),
          last_error = null
      where id = v_job.id;

      v_sent := v_sent + 1;
    exception when others then
      update public.kc_scheduled_messages
      set delivery_status = 'failed',
          last_error = left(sqlerrm, 500),
          updated_at = clock_timestamp()
      where id = v_job.id;
    end;
  end loop;

  return v_sent;
end;
$$;

revoke all on function public.kc_process_scheduled_messages() from public, anon, authenticated;

select cron.schedule(
  'guftin-scheduled-message-delivery',
  '* * * * *',
  'select public.kc_process_scheduled_messages();'
);

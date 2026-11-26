-- Production activation for Magic Moments: scheduled E2EE delivery, timed reveals and realtime.
alter table public.magic_moments
  add column if not exists scheduled_message_id uuid references public.kc_scheduled_messages(id) on delete set null;

create unique index if not exists magic_moments_scheduled_message_uidx
  on public.magic_moments(scheduled_message_id) where scheduled_message_id is not null;

grant update(scheduled_message_id) on public.magic_moments to authenticated;

create unique index if not exists magic_moment_notifications_reveal_uidx
  on public.magic_moment_notifications(recipient_id,moment_id,notification_type)
  where moment_id is not null and notification_type in ('reveal','scheduled_delivery','invite');

create or replace function public.kc_schedule_magic_moment_message(
  p_moment_id uuid,
  p_conversation_id uuid,
  p_body_envelope text,
  p_scheduled_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_moment public.magic_moments%rowtype;
  v_message_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_scheduled_at <= now() then raise exception 'Choose a future delivery time'; end if;
  if p_body_envelope is null or left(p_body_envelope,9) <> 'KC-E2EE1:' then
    raise exception 'Future messages must be end-to-end encrypted';
  end if;

  select * into v_moment from public.magic_moments
  where id=p_moment_id and creator_id=v_user for update;
  if not found then raise exception 'Magic Moment not found or not owned by this account'; end if;
  if v_moment.kind <> 'future_message' then raise exception 'Only Future Message moments can be scheduled'; end if;
  if v_moment.conversation_id is distinct from p_conversation_id then raise exception 'Chat does not match this moment'; end if;
  if not exists(select 1 from public.kc_conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=v_user) then
    raise exception 'You are no longer a member of this chat';
  end if;
  if not exists(select 1 from public.kc_conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=v_moment.recipient_id) then
    raise exception 'The recipient is no longer a member of this chat';
  end if;

  insert into public.kc_scheduled_messages(sender_id,conversation_id,body_envelope,message_type,scheduled_at,delivery_status)
  values(v_user,p_conversation_id,p_body_envelope,'text',p_scheduled_at,'queued')
  returning id into v_message_id;

  update public.magic_moments
  set scheduled_message_id=v_message_id,scheduled_at=p_scheduled_at,status='scheduled',updated_at=now()
  where id=p_moment_id;

  return v_message_id;
end;
$$;

revoke all on function public.kc_schedule_magic_moment_message(uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.kc_schedule_magic_moment_message(uuid,uuid,text,timestamptz) to authenticated;

create or replace function private.magic_moment_notify_reveal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_title text;
  v_body text;
begin
  if new.status <> 'revealed' or old.status = 'revealed' then return new; end if;

  if new.kind = 'future_message' then
    v_type := 'scheduled_delivery';
    v_title := 'Your future message is ready';
    v_body := 'Open Guftin to read the message you scheduled.';
  else
    v_type := 'reveal';
    v_title := 'A Magic Moment is ready';
    v_body := 'Open Guftin to see the moment shared with you.';
  end if;

  insert into public.magic_moment_notifications(recipient_id,moment_id,notification_type,title,body,safe_payload)
  select m.user_id,new.id,v_type,v_title,v_body,jsonb_build_object('moment_id',new.id)
  from public.magic_moment_members m
  where m.moment_id=new.id and m.user_id<>new.creator_id
  on conflict (recipient_id,moment_id,notification_type)
    where moment_id is not null and notification_type in ('reveal','scheduled_delivery','invite')
    do nothing;

  return new;
end;
$$;
revoke all on function private.magic_moment_notify_reveal() from public,anon,authenticated;
drop trigger if exists magic_moment_reveal_notifications on public.magic_moments;
create trigger magic_moment_reveal_notifications
after update of status on public.magic_moments
for each row execute function private.magic_moment_notify_reveal();

create or replace function private.magic_moment_link_scheduled_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_status='sent' and old.delivery_status is distinct from new.delivery_status then
    update public.magic_moments
      set status='revealed',revealed_at=coalesce(revealed_at,now()),updated_at=now()
      where scheduled_message_id=new.id and status<>'revealed';
  end if;
  return new;
end;
$$;
revoke all on function private.magic_moment_link_scheduled_delivery() from public,anon,authenticated;
drop trigger if exists magic_moment_scheduled_delivery_link on public.kc_scheduled_messages;
create trigger magic_moment_scheduled_delivery_link
after update of delivery_status on public.kc_scheduled_messages
for each row execute function private.magic_moment_link_scheduled_delivery();

create or replace function public.kc_process_magic_moment_reveals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.magic_moments
  set status='revealed',revealed_at=coalesce(revealed_at,now()),updated_at=now()
  where kind in ('birthday','secret_surprise')
    and status in ('draft','scheduled')
    and reveal_at is not null
    and reveal_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.kc_process_magic_moment_reveals() from public,anon,authenticated;

do $$
begin
  if not exists(select 1 from cron.job where jobname='guftin-magic-moment-reveals') then
    perform cron.schedule('guftin-magic-moment-reveals','* * * * *','select public.kc_process_magic_moment_reveals();');
  end if;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['magic_moments','magic_moment_members','magic_moment_items','magic_moment_comments','magic_moment_reactions','magic_moment_notifications'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end
$$;

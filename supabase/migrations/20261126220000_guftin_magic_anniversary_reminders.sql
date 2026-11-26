-- Timed Friendship Anniversary reminders.
drop index if exists public.magic_moment_notifications_reveal_uidx;
create unique index magic_moment_notifications_reveal_uidx
  on public.magic_moment_notifications(recipient_id,moment_id,notification_type)
  where moment_id is not null and notification_type in ('reveal','scheduled_delivery','invite','anniversary');

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
  elsif new.kind = 'anniversary' then
    v_type := 'anniversary';
    v_title := 'Your Friendship Anniversary is here';
    v_body := 'Open Guftin to celebrate your shared memories.';
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
    where moment_id is not null and notification_type in ('reveal','scheduled_delivery','invite','anniversary')
    do nothing;

  return new;
end;
$$;

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
  where kind in ('birthday','secret_surprise','anniversary')
    and status in ('draft','scheduled')
    and reveal_at is not null
    and reveal_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.kc_process_magic_moment_reveals() from public,anon,authenticated;

-- Keep HoloSpace activity and recent ordering in sync with real member actions.
create or replace function private.holospace_record_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  v_room_id uuid;
  v_actor_id uuid;
  v_activity_type text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_room_id := nullif(row_data->>'room_id','')::uuid;
  v_actor_id := auth.uid();

  if tg_table_name = 'holospace_members' then
    if tg_op = 'INSERT' then
      v_activity_type := case when row_data->>'invitation_status' = 'invited'
        then 'member.invited' else 'member.joined' end;
    elsif tg_op = 'UPDATE' then
      if old.invitation_status = 'invited' and new.invitation_status = 'active' then
        v_activity_type := 'member.joined';
      else
        return new;
      end if;
    else
      v_activity_type := 'member.left';
    end if;
  elsif tg_table_name = 'holospace_memories' then
    v_activity_type := case when tg_op = 'INSERT' then 'memory.added'
      when tg_op = 'UPDATE' then 'memory.updated' else 'memory.deleted' end;
  elsif tg_table_name = 'holospace_gallery' then
    v_activity_type := case when tg_op = 'INSERT' then 'gallery.added' else 'gallery.deleted' end;
  elsif tg_table_name = 'holospace_avatars' then
    v_activity_type := 'avatar.updated';
  elsif tg_table_name = 'holospace_themes' then
    v_activity_type := 'theme.updated';
  elsif tg_table_name = 'holospace_events' then
    v_activity_type := case when tg_op = 'INSERT' then 'event.created'
      when tg_op = 'UPDATE' then 'event.updated' else 'event.deleted' end;
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_room_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_actor_id is null then
    v_actor_id := coalesce(
      nullif(row_data->>'author_id','')::uuid,
      nullif(row_data->>'uploaded_by','')::uuid,
      nullif(row_data->>'user_id','')::uuid,
      nullif(row_data->>'created_by','')::uuid,
      nullif(row_data->>'updated_by','')::uuid
    );
  end if;

  if v_actor_id is not null then
    insert into public.holospace_activity(room_id,actor_id,client_event_id,activity_type,payload)
    values(v_room_id,v_actor_id,gen_random_uuid(),v_activity_type,
      jsonb_build_object('source_table',tg_table_name,'operation',tg_op))
    on conflict(room_id,actor_id,client_event_id) do nothing;
    update public.holospace_rooms set updated_at=now() where id=v_room_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.holospace_record_activity() from public,anon,authenticated;

drop trigger if exists holospace_activity_members on public.holospace_members;
create trigger holospace_activity_members after insert or update or delete on public.holospace_members
for each row execute function private.holospace_record_activity();
drop trigger if exists holospace_activity_memories on public.holospace_memories;
create trigger holospace_activity_memories after insert or update or delete on public.holospace_memories
for each row execute function private.holospace_record_activity();
drop trigger if exists holospace_activity_gallery on public.holospace_gallery;
create trigger holospace_activity_gallery after insert or delete on public.holospace_gallery
for each row execute function private.holospace_record_activity();
drop trigger if exists holospace_activity_avatars on public.holospace_avatars;
create trigger holospace_activity_avatars after insert or update on public.holospace_avatars
for each row execute function private.holospace_record_activity();
drop trigger if exists holospace_activity_themes on public.holospace_themes;
create trigger holospace_activity_themes after insert or update on public.holospace_themes
for each row execute function private.holospace_record_activity();
drop trigger if exists holospace_activity_events on public.holospace_events;
create trigger holospace_activity_events after insert or update or delete on public.holospace_events
for each row execute function private.holospace_record_activity();

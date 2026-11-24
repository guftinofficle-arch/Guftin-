-- Keep web-chat authorization checks semantically identical while evaluating auth claims once per statement.
alter policy "web participants send their own encrypted messages"
on public.kc_web_messages
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and sender_id = (select auth.uid())
  and exists (
    select 1 from public.kc_web_conversations c
    where c.id = kc_web_messages.conversation_id
      and (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
  )
);

alter policy "web messages read by participants"
on public.kc_web_messages
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and exists (
    select 1 from public.kc_web_conversations c
    where c.id = kc_web_messages.conversation_id
      and (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
  )
);

alter policy "users register own web devices"
on public.kc_web_devices
with check (
  user_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
);

alter policy "users update own web devices"
on public.kc_web_devices
using (
  user_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
)
with check (
  user_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
);

alter policy "web devices read by conversation participants"
on public.kc_web_devices
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.kc_web_conversations c
      where (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
        and (c.user_low = kc_web_devices.user_id or c.user_high = kc_web_devices.user_id)
    )
  )
);

alter policy "web conversations read by participants"
on public.kc_web_conversations
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and (user_low = (select auth.uid()) or user_high = (select auth.uid()))
);

alter policy "web conversation members read by participants"
on public.kc_web_conversation_members
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.kc_web_conversations c
      where c.id = kc_web_conversation_members.conversation_id
        and (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
    )
  )
);

alter policy "web participants can view each other profiles"
on public.kc_profiles
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') <> 'true'
  and (
    id = (select auth.uid())
    or exists (
      select 1 from public.kc_web_conversations c
      where (c.user_low = (select auth.uid()) or c.user_high = (select auth.uid()))
        and (c.user_low = kc_profiles.id or c.user_high = kc_profiles.id)
    )
  )
);

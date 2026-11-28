# Guftin Chat, Group, Live and Memory Experience — Design

## Goal
Complete the requested chat-folder, group gallery, chat search/library, notification preference, reaction, LIVEVERSE, HoloSpace timeline, and Magic Moments reveal experience without replacing existing Guftin chat flows.

## Existing implementation found
- The app already creates Unread, Friends, Groups and Important folder records for users, and the database seed migration backfills existing accounts. Friends and Groups were still filtered by manual folder-item membership.
- ChatExperiencePanel already contains message-type search filters, member lists and personal tags, saved messages, reply reminders, a per-chat preference record, custom sticker upload, message-reaction records, send-effect metadata, and a chat attachment index.
- LIVEVERSE already stores reactions and receives realtime inserts, with a basic Animated spring effect.
- Magic Moments already stores reveal_at and status, but the screen only printed the reveal date and did not present a countdown or an explicit reveal interaction.
- HoloSpace tables already exist in Supabase (rooms, members, memories, gallery and activity), with member-based RLS and the private holospace-gallery storage bucket; there was no HoloSpace screen in this app branch.

## Design decisions
1. Keep the four standard folder records created for every account. Unread remains a live unread filter; Friends automatically lists direct chats; Groups automatically lists group chats; Important and user-created folders remain explicitly curated.
2. Keep chat search and its shared library conversation-scoped. Add a dedicated group Photo Gallery view using decrypted media already present in the open conversation state; do not bypass E2EE or try to decode raw database envelopes in a gallery.
3. Keep group member tags personal to the current user. Every group member can react to messages and sticker/image messages with the existing allow-listed reaction records.
4. Make reactions and send-effect labels visibly animated, while retaining the existing message/reaction data model.
5. Add a HoloSpace timeline view backed by the existing holospace_rooms, holospace_members, holospace_memories, and holospace_gallery tables. Generate short-lived signed URLs only for gallery objects visible through existing RLS. Do not make the private bucket public.
6. For Magic Moments, display a live countdown from reveal_at. Only the creator may explicitly reveal a scheduled moment, and only after the time has arrived; update status and revealed_at under the existing creator-only RLS policy.
7. Preserve the existing preference schema. Wire preferences to the notification path where supported; do not claim custom sound playback unless the sound asset/channel exists in the build.
8. Harden the public security-definer folder-seeding functions before any migration is applied.

## Acceptance criteria
- New and existing accounts have the four default folders without duplicate records.
- Friends and Groups show their corresponding conversations without manually adding every chat; custom folders still require explicit additions.
- A group has separate Members, Tags, Photo Gallery, and Important sections.
- Search filters stay distinct for messages, photos, videos, links and files; the attachment library stays scoped to one chat.
- Reactions and message effects have visible motion, and group messages/stickers can receive reactions from other members subject to RLS.
- LIVEVERSE realtime reactions remain supported.
- HoloSpace displays a newest-first timeline of accessible memories and saved gallery media with private signed URLs.
- Magic Moments shows a countdown and an owner-only reveal action when the date arrives.
- TypeScript validation and targeted Node tests pass.

## Safety and privacy constraints
- Do not weaken RLS or storage privacy.
- Do not display data from rooms or conversations the current user cannot access.
- Do not expose service-role credentials in the mobile client.
- Keep scheduled surprise content hidden until the reveal time according to the current database policy.

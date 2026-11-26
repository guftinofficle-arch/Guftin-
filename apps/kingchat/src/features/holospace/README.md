# Guftin HoloSpace

**Your Friends. Your Memories. Your Own Universe.**

This is an isolated feature module on `feature/guftin-holospace`; it does not replace or merge the Liveverse feature folder.

## Foundation committed
- Room, membership/invitation, memory wall, gallery metadata, per-room avatar preferences, themes, events and deduplicated activity tables.
- Membership/owner RLS; private buckets for gallery, avatars and backgrounds.
- Realtime publication for durable room collaboration records.
- Room owner is automatically registered by a database trigger.
- Invitations require owner authorization; invitees accept their own invitations.
- Avatar art uses predefined keys, avoiding paid image-generation APIs.

## Implementation status
- [x] Separate HoloSpace source directory and database migration foundation.
- [x] Initial HoloSpace home / my rooms / invitations / recent / create screens in the main app navigation.
- [x] Main navigation tab and a direct/group chat header entry that creates a room linked to its originating chat ID.
- [ ] Real invitation cards through the current Guftin messaging send path.
- [x] Basic persistent text Memory Wall create/list flow; edit/delete controls and memory media attachments remain incomplete.
- [ ] Shared Gallery picker, progress, viewer and deletion.
- [x] Predefined avatar choices and saved per-room avatar preferences (UI currently saves a selected key).
- [x] Predefined room themes persist through Supabase; custom wallpaper upload/preview remains incomplete.
- [ ] Special Moments with timezone-aware countdown/event editing.
- [ ] Members/room settings, privacy, leave and delete flows.
- [ ] Live Hangout with real WebRTC, permissions, reconnect and tested ICE/TURN.
- [ ] Realtime subscription lifecycle and offline recovery.
- [x] Initial pgTAP schema/RLS-flag/private-bucket/Realtime smoke test file added (not yet executed); two-account authorization tests and Android/Web builds remain incomplete.

## Database migration
`supabase/migrations/20261126190000_guftin_holospace_foundation.sql`

Review and test the migration in a disposable Supabase branch before applying it to production. It creates private storage buckets and RLS policies. It is not applied to the live project by this source commit.

## Voice and networking
No paid provider is silently introduced. Live Hangout needs microphone permissions and WebRTC signalling. STUN/TURN is required for reliable connectivity across restrictive NATs; a public STUN-only setup is not a production reliability guarantee. Do not show a connected state until the peer connection reaches its connected state.

## Security notes
- Only authenticated users can use the API.
- Room content is readable only to active members.
- Public room discovery does not automatically expose private content.
- Owner-only room/theme administration is enforced in RLS.
- Gallery/avatar/background objects are stored in private buckets with room-scoped object paths.
- Never put a Supabase service-role key in mobile/web code.


## Current app wiring limits

The current navigation entry creates a room associated with the active direct/group conversation. The existing chat invitation-card send path has not yet been wired, so chat participants are not automatically invited. The room detail currently exposes persistent text memories, predefined theme choices and avatar preferences. Gallery upload/view, member management, event creation, room settings and voice are not complete yet.

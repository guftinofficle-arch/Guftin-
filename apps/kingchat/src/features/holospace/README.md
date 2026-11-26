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
- [ ] HoloSpace home / my rooms / invitations / recent / create screens.
- [ ] Main navigation tab and chat/group entry points.
- [ ] Real invitation cards through the current Guftin messaging send path.
- [ ] Memory Wall editor and media attachments.
- [ ] Shared Gallery picker, progress, viewer and deletion.
- [ ] Predefined avatar picker and saved room avatar preferences.
- [ ] Room designer with persisted themes and wallpaper.
- [ ] Special Moments with timezone-aware countdown/event editing.
- [ ] Members/room settings, privacy, leave and delete flows.
- [ ] Live Hangout with real WebRTC, permissions, reconnect and tested ICE/TURN.
- [ ] Realtime subscription lifecycle and offline recovery.
- [ ] Two-account RLS/integration tests and Android/Web builds.

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

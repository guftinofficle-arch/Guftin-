# Guftin LIVEVERSE

**One Chat. One Space. Infinite Possibilities.**

LIVEVERSE is integrated with Guftin chats and provides a collaboration workspace plus a dedicated voice-room screen.

## Implemented
- Main navigation tab with shared Notes, Tasks, canvas strokes, presence/pointers and private shared media.
- Direct/group chat entry opens the dedicated LIVE voice-room screen for that conversation.
- Create or join an active room linked to the source chat.
- LiveKit audio connection, participant list, microphone permission prompt, mute/unmute, leave and host end-room controls.
- Supabase membership-scoped RLS, Realtime publication and private media storage.
- Short-lived membership-authorized LiveKit token Edge Function with JWT verification.
- Production migrations applied: LIVEVERSE foundation, anonymous-access hardening and voice-room schema.

## Verified so far
- Supabase owner/member/non-member RLS checks passed in transaction-based tests; test rows were rolled back.
- Voice-room membership policy was exercised with two existing authenticated accounts.
- TypeScript validation and responsive web export passed on the combined feature branch before the final small UI changes; the latest checks are being rerun.
- LiveKit secrets are server-side only. Their presence and an actual two-device audio session have not yet been verified.

## Still pending
- Real Android two-phone test: create room, join from second account, mute/unmute, leave and end room.
- Verify microphone permission and audio routing on real Android devices and iOS.
- Full collaboration regression: concurrent canvas edits, note conflict handling, media upload progress, reconnect/offline behavior.
- Final Android APK startup QA after all three features are integrated.

## Backend
- Client: `apps/kingchat/src/features/liveverse/liveverseClient.ts`
- Dedicated voice UI: `apps/kingchat/src/features/liveverse/LiveverseScreen.tsx`
- Token function: `apps/kingchat/supabase/functions/liveverse-livekit-token/index.ts`
- Voice-room migration: `apps/kingchat/supabase/migrations/20261126140000_guftin_liveverse_voice_rooms.sql`
- Foundation migrations: `supabase/migrations/20261126180000_guftin_liveverse_foundation.sql` and `20261126132419_guftin_liveverse_block_anonymous_access.sql`

Never place LiveKit API secrets or Supabase service-role credentials in the mobile or web client.

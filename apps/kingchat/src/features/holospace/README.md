# Guftin HoloSpace

**Your Friends. Your Memories. Your Own Universe.**

HoloSpace is integrated into the combined Guftin feature branch and reuses existing Guftin authentication, chat membership and Supabase.

## Implemented
- Navigation: Home, My Spaces, Invited, Recent and Create.
- Create/open rooms from direct or group chats and send real invitation cards through Guftin chat.
- Private/public room visibility, owner/member management, invitation acceptance, leave and owner deletion.
- Memory Wall with author edit/delete.
- Private shared Gallery for photos/videos with signed URLs and authorized deletion.
- Per-user room avatar preferences and persisted themes.
- Timezone-aware events/countdowns with create/edit/delete.
- Room Realtime subscriptions and per-user presence.
- LiveKit audio hangout UI with participant list, microphone permission request, mute/unmute and leave.
- Membership-authorized short-lived LiveKit token Edge Function.

## Production backend status
- HoloSpace foundation and activity-tracking migrations are applied to the connected Supabase project.
- All eight HoloSpace tables have RLS enabled and Realtime publication.
- Gallery, avatar and background buckets are private.
- `holospace-livekit-token` is deployed with JWT verification.
- Initial two-account database smoke test passed: a non-member could not read a private room, a chat member could see/join a public room, and memory/event/avatar/theme operations completed. Test data was rolled back.
- The smoke test did not exercise the actual mobile UI, media upload, or LiveKit audio connection.

## Still pending
- Real Android two-phone test: create room, invite/accept, shared memory, gallery upload/view, theme/avatar, voice join/mute/leave.
- Test private media access and deletion across owner/member/non-member accounts.
- Confirm LiveKit secrets are present and test across different networks.
- Add upload progress/retry and validate offline/reconnect behavior.
- Final Android APK startup QA and regression tests after all three features are integrated.

## Backend files
- Migration: `supabase/migrations/20261126190000_guftin_holospace_foundation.sql`
- Activity migration: `supabase/migrations/20261126200000_guftin_holospace_activity_tracking.sql`
- Client: `apps/kingchat/src/features/holospace/holospaceClient.ts`
- Voice token function: `apps/kingchat/supabase/functions/holospace-livekit-token/index.ts`
- Schema tests: `supabase/tests/holospace_schema.test.sql`

All LiveKit credentials remain in Supabase Edge Function secrets, never in Expo/browser/mobile client variables.

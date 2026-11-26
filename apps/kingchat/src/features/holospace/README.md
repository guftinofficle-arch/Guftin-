# Guftin HoloSpace

**Your Friends. Your Memories. Your Own Universe.**

HoloSpace is developed on the isolated `feature/guftin-holospace` branch and reuses Guftin authentication, chat membership and the existing Supabase project.

## Implemented in source

- [x] Main navigation: Home, My Spaces, Invited, Recent and Create.
- [x] Create/open a room from a direct or group chat and retain its source chat reference.
- [x] Send a real room-invitation message through the existing Guftin chat send path when opened from its source chat.
- [x] Persist room details and private/public visibility.
- [x] Invite members from the linked chat participant list; invited users can accept their own invitation.
- [x] Member list, owner-authorized member removal, member leave and owner room deletion.
- [x] Persistent Memory Wall text entries.
- [x] Private shared Gallery: select photo/video, validate type/size, upload, create short-lived signed URLs, view media and remove permitted items.
- [x] Per-user avatar preference keys and predefined room themes persisted in Supabase.
- [x] Create and list timezone-aware room countdown/events; event creator or room owner can delete events.
- [x] Room-scoped Realtime subscriptions and unique per-user presence identity.
- [x] LiveKit audio hangout UI with participant list, microphone mute/unmute and leave controls.
- [x] Membership-authorized short-lived LiveKit token Edge Function source.
- [x] pgTAP schema/RLS/storage/Realtime smoke-test source.

## Still required before calling this production-ready

- Deploy the migration and Edge Function to a disposable Supabase branch/project first; production project has not been modified by these source commits.
- Execute pgTAP and two-account authorization tests, including negative tests for non-members, invitation acceptance, member removal, storage downloads and secret/token access.
- Configure server-side `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`; then test two real devices across different networks with microphone permission, reconnect, mute/unmute and leave.
- Add profile-name/avatar resolution to the member list, memory edit/delete UI, event edit UI, visible upload progress, offline queue/retry and full recent-activity feed.
- Verify gallery/storage cleanup when a room is deleted. Database cascade does not by itself remove Storage objects.
- Run iOS device build/tests and Android/web regression checks after all requested features are complete.
- Verify existing chat, calls, groups, statuses and channels remain unaffected.

## Backend files

- Migration: `supabase/migrations/20261126190000_guftin_holospace_foundation.sql`
- Client: `apps/kingchat/src/features/holospace/holospaceClient.ts`
- Voice token function: `supabase/functions/holospace-livekit-token/index.ts`
- Schema smoke tests: `supabase/tests/holospace_schema.test.sql`

Deploy the token function from `apps/kingchat` only after the database migration has been tested:

```sh
supabase functions deploy holospace-livekit-token --project-ref oyjemlbsmffvofefgxvd
```

Set LiveKit credentials only as Supabase Edge Function secrets. Never place the API secret or Supabase service-role key in Expo, browser, or mobile client variables.

## Security and privacy

- Private rooms and media are membership-scoped by RLS.
- The recipient does not get access merely because a room ID is known.
- Uploads use private Storage buckets and signed URLs.
- The app uses the signed-in user's Supabase session; no service-role credential is shipped in client code.
- Chat history is not copied automatically into HoloSpace; only explicitly created room content is stored.

## Build policy

Android APK workflows are manual-only while the requested feature set is being completed. Do not start a release/QA APK build until HoloSpace, Liveverse and Magic Moments work is complete and the final source has passed the agreed validation steps.

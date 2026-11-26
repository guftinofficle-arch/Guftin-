# Guftin Liveverse

**One Chat. One Space. Infinite Possibilities.**

This directory is the isolated implementation area for Liveverse. It is deliberately separated from the existing chat UI so the feature can be developed and reviewed without replacing Guftin's current messaging flows.

## Current implementation state

- [x] Dedicated Liveverse feature area reserved in the native app source tree.
- [x] Database migration foundation for spaces, members, notes, tasks, canvas state, media metadata and idempotent events.
- [x] Membership-scoped RLS and a private media bucket with object policies; membership role escalation is restricted.
- [x] Realtime publication for persisted collaboration data.
- [x] Liveverse main navigation tab plus direct/group chat header entry points.
- [x] Cross-platform SVG drawing surface; strokes persist with optimistic version checks and refresh through Realtime. Concurrent stroke merge is not yet implemented.
- [x] Shared Notes editor with optimistic version checks; stale saves show a conflict and require reload.
- [x] Presence and pointer broadcast primitives; live pointer cursor rendering remains incomplete.
- [x] Shared image/video picker, private upload, signed-URL viewer and authorized deletion. Synchronized playback remains incomplete.
- [x] Shared Tasks UI for create, complete/reopen and delete with persistent Supabase state.
- [x] LiveKit membership-authorized token endpoint and actual audio-room join/mute/leave UI added; deployment and two-device audio validation remain pending.
- [ ] Two-account authorization and collaboration tests.
- [ ] Android and web production builds plus regression tests.

## Architecture decisions

- Reuse the existing Supabase project and authenticated Guftin account.
- Never ship a service-role/secret key in client code.
- Space access is membership-scoped. A signed-in user is not automatically allowed to read a space.
- Persist notes/tasks/canvas/media metadata; use Realtime Presence/Broadcast for short-lived pointer and voice signalling rather than high-frequency database writes.
- The initial voice-room client should use WebRTC peer connections with authenticated, short-lived room signalling. Mesh is suitable only for small rooms; a larger room needs an SFU and must not be described as production-scalable until tested.
- Store media in the private `liveverse-media` bucket and use authenticated downloads.
- Chat source identifiers are stored as optional UUID references without assuming an undocumented foreign key to the current chat schema.

## Migration

Apply `supabase/migrations/20261126180000_guftin_liveverse_foundation.sql` only after reviewing it against the current database and testing it in a disposable Supabase branch. The migration creates the private bucket and policies as well as tables. Do not apply it to production until the SQL and RLS tests pass.

## Required settings / secrets

No new third-party paid service is required for the database foundation. Existing client configuration should continue to use the project's public/publishable key only. Do not add service-role keys to Expo, browser, or app environment variables.

Voice Room will require microphone permission declarations and platform permission prompts in the Android/iOS app. It does not require a third-party key for a small-room WebRTC prototype, but STUN/TURN connectivity and real-network testing are required before claiming reliable production calling. A free public STUN server alone is not a reliable production solution.

## Security and verification checklist

1. Two authenticated users can create a space and join only when invited by its owner/moderator.
2. A third, non-member account cannot select, mutate, or download that space's content.
3. A user cannot promote themselves or add members unless authorized.
4. Storage object paths always begin with the authorized space UUID.
5. Duplicate client event IDs are rejected by the unique constraint.
6. Concurrent note/canvas updates use versions and handle conflicts instead of silently overwriting newer work.
7. Verify offline recovery, subscription rejoin and duplicate event handling.
8. Run native Android, iOS and web build checks plus existing Guftin regression tests.

The SQL foundation is not proof that the six user-facing modules are complete. Each unchecked item requires implementation and real-device/two-account verification.


## Current client-library limits

The client library is an initial backend integration layer, not a finished user-facing feature. The app does not yet expose Liveverse entry points, canvas drawing, notes editor, task board, media picker/viewer, or voice room UI. The SQL migration and client operations have not yet been applied/tested against two real accounts. The database migration remains a source file until explicitly applied to a Supabase test project.


## App integration added

The Liveverse tab is now wired into the main navigation. Direct and group chat headers open a room-creation flow linked to the originating conversation. The workspace includes persistent notes, tasks, a collaborative SVG canvas document, shared media upload/view/delete, Realtime refresh/presence and a LiveKit voice-room join screen. Chat-member invitation uses the linked conversation membership list.

## LiveKit voice deployment

The token endpoint is at `supabase/functions/liveverse-livekit-token/index.ts` relative to `apps/kingchat`. Deploy it using:

```sh
supabase functions deploy liveverse-livekit-token --project-ref oyjemlbsmffvofefgxvd
```

Configure server-side Edge Function secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Do not put these in Expo public environment variables. The endpoint checks authenticated Liveverse membership before issuing a short-lived token.

## Remaining verification and implementation

- The canvas uses saved SVG strokes and refreshes remote changes; it does not yet implement conflict-free concurrent drawing merge or visible cursor overlays.
- Notes use optimistic versioning; a conflict requires reload rather than automatic merge.
- Voice is not verified until the Edge Function is deployed and two real devices successfully join, mute/unmute and leave.
- SQL migration and tests have not been applied/run against a disposable Supabase branch; two-account authorization tests remain outstanding.
- The current Liveverse workspace UI does not yet include a fully polished member role manager or synchronized video playback.
- Android/web builds must pass on the final feature commit; iOS still needs a device build/test.

# Guftin Magic Moments

Integrated branch: `feature/guftin-all-three-features`

## Included experiences
- **Birthday Surprise** — private birthday moment with a server-enforced reveal date.
- **Memory Capsule** — a shared, member-only collection of messages and media.
- **Future Message** — an end-to-end encrypted message queued in Guftin's existing `kc_scheduled_messages` pipeline and delivered by the existing Postgres cron worker.
- **Secret Surprise** — creator-only content until its scheduled reveal; reveal is enforced by RLS and a server-side minute scheduler.
- **Together Moments** — shared text, photo/video and voice-note contributions, comments and reactions.
- **Friendship Anniversary** — a dedicated moment type for a shared milestone and memory collection.

## App behavior
- Entry appears as the **Magic** tab and in a chat as an invitation card.
- Moments are created from the currently open direct or group chat.
- Users are not asked to import chat history. They intentionally choose what to add.
- Private media is stored in the `magic-moments` bucket; signed URLs are short-lived.
- The creator is added atomically as owner. Invitees accept before reading or contributing.
- Secret/birthday content remains hidden from its recipient until the reveal time.
- Future Message content is encrypted on-device for the active device roster. The server queues and delivers only the ciphertext.
- Realtime publication covers moments, membership, items, comments, reactions and notifications.

## Production activation
- Foundation migration: `20261126200000_guftin_magic_moments_foundation.sql`.
- Production activation: `20261126210000_guftin_magic_moments_production_activation.sql`.
- Edge Functions deployed with JWT verification: `invite-magic-moment-member` and `reveal-secret-surprise`.
- Existing `guftin-scheduled-message-delivery` cron job is reused for encrypted Future Messages.
- New `guftin-magic-moment-reveals` cron job checks scheduled birthday and secret reveals every minute.

## Still to verify
- Two-account RLS checks for invite acceptance and pre-reveal secrecy.
- Actual Android media picker/upload, voice-note recording/playback and notification display.
- End-to-end scheduled delivery with real registered E2EE devices.
- Combined Android APK startup and two-phone tests after all three features are integrated.

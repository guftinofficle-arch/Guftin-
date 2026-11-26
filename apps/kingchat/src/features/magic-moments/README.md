# Guftin Magic Moments

**Make memories today. Send a surprise into tomorrow.**

## Included experiences
- **Birthday Surprise** — private birthday moment with a server-enforced reveal date.
- **Memory Capsule** — shared member-only collection of text and selected media.
- **Future Message** — end-to-end encrypted message queued in Guftin's existing `kc_scheduled_messages` pipeline and delivered by its Postgres cron worker.
- **Secret Surprise** — recipient-only hidden content until its scheduled reveal.
- **Together Moments** — shared text, photo/video contributions, comments and reactions.
- **Friendship Anniversary** — scheduled anniversary reminder and shared memories.

## App behavior
- Magic Moments has its own navigation tab and sends invitation cards into the currently open direct/group chat.
- Users choose what to add; chat history is never imported automatically.
- The creator is added as owner; invitees accept before reading or contributing.
- Private media is stored in the `magic-moments` bucket with short-lived signed URLs.
- Birthday/secret reveals and anniversary reminders are checked server-side every minute.
- Future Message is encrypted on-device for every active conversation device. The server queues ciphertext only.
- Invite/reveal notifications are stored in-app; invitation and manual reveal flows also dispatch Expo push notifications.

## Production backend status
- Foundation, production activation and anniversary migrations are applied.
- RLS is enabled for all six Magic Moment tables; Realtime is enabled.
- `magic-moments` Storage bucket is private.
- `invite-magic-moment-member`, `reveal-secret-surprise` and updated `guftin-push` Edge Functions are deployed with JWT verification.
- Two-account RLS smoke tests passed: a recipient could not read secret content before reveal; after reveal the moment and content became visible and a notification was created.
- Future Message queue/link smoke test passed: it remained hidden before delivery, then became visible with a scheduled-delivery notification after the queue status changed to sent. This was a database transaction test, not a real E2EE device delivery test.

## Still pending
- Real E2EE scheduled delivery with two registered devices and the production cron worker.
- Real Android media picker/upload and push-notification display.
- Final Android APK startup QA and two-phone tests after all three features are integrated.

## Backend files
- Client: `apps/kingchat/src/features/magic-moments/magicMomentsClient.ts`
- Foundation: `supabase/migrations/20261126200000_guftin_magic_moments_foundation.sql`
- Production activation: `supabase/migrations/20261126210000_guftin_magic_moments_production_activation.sql`
- Anniversary reminders: `supabase/migrations/20261126220000_guftin_magic_anniversary_reminders.sql`

The existing scheduled-message worker is reused; no duplicate scheduled-message table or worker is introduced.

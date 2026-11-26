# Guftin Magic Moments

Feature branch: `feature/guftin-magic-moments`

## Included foundation
- Birthday Surprise, Memory Capsule, Future Message, Secret Surprise, Together Moments and Friendship Anniversary data model.
- Member roles, contributor/recipient separation, private media bucket, signed media URLs.
- RLS policies that hide unrevealed Secret Surprise content from its recipient and hide scheduled-message bodies from recipients until backend delivery.
- Client CRUD for moments, invitations, items, comments, reactions, private uploads and scheduled-message management.
- Future delivery is intentionally server-only; a trusted scheduler must call the delivery Edge Function. The app must never mark a scheduled message as sent.
- No automatic chat-history ingestion. Users add content intentionally.

## Production activation still required
1. Review and apply migration `20261126200000_guftin_magic_moments_foundation.sql` to the intended Supabase project.
2. Configure private backend secrets for the delivery worker. Never put service-role credentials in the mobile app or repository.
3. Deploy and schedule the delivery Edge Function using Supabase Vault + pg_cron/pg_net, following the official Supabase scheduling guide.
4. Wire the UI/chat card flow and push notification delivery to the existing Guftin chat/notification infrastructure.
5. Run two-account RLS tests, secret pre-reveal denial, idempotent scheduled delivery, cancellation and platform tests.

This is an implementation foundation, not a claim of live production activation. No database migration is applied automatically by this commit.

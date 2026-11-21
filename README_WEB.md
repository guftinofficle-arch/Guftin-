# Guftin Web Portal

This repository's root `index.html` is the Guftin browser application. It is a static Cloudflare Pages-compatible site and uses the existing Supabase project.

## Connected browser features

- Supabase email/password sign-up and sign-in (no Google sign-in).
- Email verification and password recovery through Supabase Auth configuration.
- Permanent username creation and validation.
- Existing Guftin profile and contacts tables.
- Profile display-name/about editing and profile photo upload through the existing private `chat-media` bucket.
- Username contact search and adding contacts.
- Private one-to-one browser conversations through `kc_web_conversations` and `kc_web_messages`.
- Browser message encryption using Web Crypto (P-256 ECDH, HKDF-SHA-256 and AES-GCM); per-device wrapped message keys are stored in `key_envelopes`.
- Real-time browser inbox refresh through Supabase Realtime.
- Responsive mobile/desktop layout and a navigation-only offline shell.

## Important release boundaries

- The frontend includes only the Supabase publishable key. Never add a service-role key to browser code.
- Browser conversation records use the existing `kc_web_*` tables. They are currently separate from the Android/native inbox; account identity, profile and contacts use the shared Guftin backend.
- Both participants must have opened Guftin Web and registered an active browser encryption device before sending browser messages.
- Private browser encryption keys are stored in IndexedDB on the device. Clearing site data or losing the browser profile can make messages addressed to that device unreadable.
- The browser encryption protocol has not yet received an independent security audit. Do not advertise it as audited or certified.
- Groups, status publishing, browser push, media conversations and voice/video calls are not enabled in this browser release. The UI does not pretend these features are active.
- Account deletion is handled as a support request; this frontend does not delete Supabase Auth users.

## Hosting

Deploy the repository root as a static Cloudflare Pages site (no build command; output directory `/` or repository root). The PWA service worker caches only the public navigation shell. It does not cache Supabase API responses or private conversation data.

Set the Supabase Auth Site URL and allowed redirect URLs to the deployed Guftin website URL. Configure email SMTP/Resend in the existing Supabase Auth project. No Google OAuth provider is required.

## Validation checklist before public production

1. Verify registration and confirmation email delivery on the deployed domain.
2. Verify password reset and sign-out/session persistence.
3. Test username collision and permanent username enforcement.
4. Test contact add/remove between two verified accounts.
5. Test browser device registration on two separate browsers.
6. Test encrypted sending/decryption in both directions and on a second registered device.
7. Verify Storage RLS and signed profile-photo access.
8. Review Supabase security advisors and complete an independent cryptography review.
9. Confirm Cloudflare Pages deployment and mobile PWA installation, then add the official Guftin logo assets when available.

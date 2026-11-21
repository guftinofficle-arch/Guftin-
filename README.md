# GUFTIN

GUFTIN is a communication product with an Android application and a responsive browser portal.

- Official brand: **GUFTIN**
- Support: **guftinofficle@gmail.com**
- Website: https://guftin-official.pages.dev

## Browser portal

The root `index.html` is a static Cloudflare Pages-compatible application connected to the existing Guftin Supabase project. It uses email/password authentication only; Google Sign-In is not part of the website.

The browser release currently connects these real services:

- Email/password account creation, sign-in, email verification flow and password recovery through Supabase Auth.
- Permanent username validation and profile initialization.
- Existing Guftin profile and contacts records.
- Profile display name, about text and private profile-photo storage.
- Username-based contact addition.
- One-to-one encrypted text conversations using the existing `kc_web_*` tables and Supabase Realtime.
- Browser device encryption keys stored locally in IndexedDB.
- Responsive desktop and mobile layouts.
- PWA manifest and a privacy-conscious offline navigation shell.

Read [README_WEB.md](README_WEB.md) for deployment setup, browser messaging details, configuration and the pre-production test checklist.

## Important platform boundaries

The browser conversation tables are separate from the Android/native inbox in the current backend. Accounts, profiles and contacts are shared, but browser conversation threads are not currently synchronized into Android chat history. Do not claim cross-platform message synchronization until a compatible, tested migration is implemented.

The current browser release does not enable group chat, status publishing, media conversations, browser push notifications or voice/video calls. These features should remain unavailable in the web UI until their real backend and client implementations are complete.

Browser message encryption has not received an independent security audit. Do not market it as audited or certified end-to-end security. Browser private keys are stored in the device's IndexedDB; loss of browser site data can make messages encrypted for that device unreadable.

## Supabase security

The browser embeds only a Supabase publishable key. Never put a Supabase service-role or secret key in `index.html`, other browser assets or any `NEXT_PUBLIC_*` variable. Private data access must continue to be enforced by database RLS and Storage policies.

The website uses the existing Supabase project and existing database. No user data reset is required for the browser portal.

## Hosting

The site is designed for Cloudflare Pages static hosting from the repository root, with no build command and the repository root as the output directory. Set the existing Supabase Auth Site URL and redirect allow-list to the deployed Guftin web domain. Configure the existing Supabase Auth SMTP/Resend sender separately in the Supabase dashboard and verify real email delivery before public launch.

## Validation before production

Complete the checklist in [README_WEB.md](README_WEB.md), including real email verification, password recovery, two-account contact and chat tests, device-key decryption checks, Storage RLS review, and Cloudflare Pages deployment verification.

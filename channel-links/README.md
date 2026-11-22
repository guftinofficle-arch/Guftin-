# Guftin HTTPS Channel Links — Cloudflare Pages

A paid custom domain is not required. The free HTTPS hostname assigned by Cloudflare Pages (`PROJECT.pages.dev`) can be used.

## One-time Cloudflare Pages setup

1. Open Cloudflare Dashboard → **Workers & Pages**.
2. Choose **Create application** → **Pages** → **Connect to Git**.
3. Select repository **guftinofficle-arch/Guftin-**.
4. Choose branch **release/guftin-v1.5.7-no-email-verification**.
5. Set:
   - Framework preset: **None**
   - Build command: leave empty
   - Build output directory: `. ` (a single dot, without a space)
   - Root directory (advanced): `channel-links`
6. Deploy. Cloudflare assigns an HTTPS hostname such as `your-project.pages.dev`.
7. Copy the hostname only (no `https://`, no path, no trailing slash).

## Finish the Android app

Add a GitHub repository variable:

- Repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**
- Name: `GUFTIN_LINK_HOST`
- Value: the exact hostname Cloudflare assigned, e.g. `your-project.pages.dev`

Send that hostname so the Android App Link host, share URL and new APK can be finalized.

## Website verification file

The `.well-known/assetlinks.json` file associates package `com.guftin.app` with the SHA-256 signing certificate verified in GitHub Actions QA builds #35 and #39. Those APKs are debug-signed. A separately signed production APK must have its release-signing fingerprint added too.

The file must be publicly available, with no redirects, at:

`https://YOUR-PAGES-HOST/.well-known/assetlinks.json`

## Final channel link format

`https://YOUR-PAGES-HOST/channel/INVITE_CODE`

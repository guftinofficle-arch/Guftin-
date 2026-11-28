# Guftin Chat, Groups and Memory Experience Implementation Plan

> For agentic workers: Execute this plan task-by-task. Every task uses test-first changes where a pure behavior can be isolated.

**Goal:** Finish the requested Guftin chat-folder, group media, reaction, HoloSpace timeline and Magic Moments reveal experience using the existing Supabase-backed data.

**Architecture:** Preserve the existing React Native screens and Supabase RLS model. Add small pure helpers for folder filtering and reveal countdowns, extend existing chat and Magic Moments UI, and add a dedicated HoloSpace timeline view backed by current private tables and signed URLs.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, TypeScript 5.9, Supabase JS, Node built-in test runner.

**Spec:** docs/superpowers/specs/2026-11-28-guftin-chat-memories-design.md

## Global Constraints
- Preserve existing Android/iOS Expo structure and all current Guftin chat flows.
- Use the existing Supabase project schema and RLS; do not make private buckets public.
- Keep folder seeding idempotent with ON CONFLICT DO NOTHING.
- Never display raw encrypted message envelopes as media content.
- HoloSpace gallery media uses private signed URLs from holospace-gallery.
- Reveal actions are creator-only and cannot happen before reveal_at.
- TypeScript validation remains npm run typecheck.

## Review Focus
- Existing users with no folder items: Friends and Groups should still populate from their chat type.
- Channels and announcements: must not be included in Friends or Groups accidentally.
- Empty or invalid reveal dates: countdown should be absent, never NaN or Infinity.
- A recipient opening a scheduled Magic Moment: content must remain hidden until release under current RLS rules.
- Users with membership in multiple HoloSpace rooms: timeline must deduplicate room IDs and preserve newest-first ordering.

---

### Task 1: Default chat folder filtering

**Files:**
- Create: apps/kingchat/src/features/chat/chatFolderFilters.mjs
- Create: apps/kingchat/src/features/chat/chatFolderFilters.d.mts
- Create: apps/kingchat/tests/chat-folder-filters.test.mjs
- Modify: apps/kingchat/App.tsx
- Modify: apps/kingchat/package.json
- Create: .github/workflows/guftin-chat-memories-check.yml

**Interfaces:**
- Produces: shouldShowChatInFolder(chat, folder): boolean.
- Unread uses chat.unread > 0; Friends includes only kind === direct; Groups includes only kind === group; Important and user-created folders use explicit membership.

- [ ] Write tests for Friends, Groups, Unread, Important and custom folders.
- [ ] Run node --test tests/chat-folder-filters.test.mjs; confirm the expected missing behavior fails before implementation.
- [ ] Implement the pure helper and declaration file.
- [ ] Replace the inline App.tsx filter with the tested helper.
- [ ] Add the test script and branch-scoped CI workflow.
- [ ] Run targeted tests and npm run typecheck.

### Task 2: Group photo gallery and animated chat feedback

**Files:**
- Modify: apps/kingchat/src/features/chat/ChatExperiencePanel.tsx

**Interfaces:**
- Consumes: existing MessageRow[], kc_message_reactions, kc_message_effects, and sticker callbacks.
- Produces: a group-only Photo Gallery section and animated reaction/effect presentation.

- [ ] Add a group-only gallery tab and a photo grid sourced from decrypted, currently loaded conversation messages.
- [ ] Animate reaction feedback after a successful save; animate existing send-effect metadata.
- [ ] Keep group reactions available for text, image/sticker and file messages.
- [ ] Run npm run typecheck.

### Task 3: HoloSpace timeline gallery

**Files:**
- Create: apps/kingchat/src/features/holospace/HolospaceTimelineScreen.tsx
- Modify: apps/kingchat/src/features/magic-moments/MagicMomentsScreen.tsx

**Interfaces:**
- Consumes: holospace_rooms, holospace_members, holospace_memories, holospace_gallery, private bucket holospace-gallery.
- Produces: HolospaceTimelineScreen({ userId, onClose }).

- [ ] Add a HoloSpace entry point from the Magic Moments home screen.
- [ ] Load owned rooms and accepted memberships; deduplicate room IDs.
- [ ] Load memories and gallery records in reverse chronological order; create one-hour signed URLs only for media paths returned under RLS.
- [ ] Render a timeline with memory cards, photo/video cards, room labels and a useful empty state.
- [ ] Run npm run typecheck.

### Task 4: Magic Moments reveal countdown and animation

**Files:**
- Create: apps/kingchat/src/features/magic-moments/magicMomentCountdown.mjs
- Create: apps/kingchat/src/features/magic-moments/magicMomentCountdown.d.mts
- Create: apps/kingchat/tests/magic-moment-countdown.test.mjs
- Modify: apps/kingchat/src/features/magic-moments/MagicMomentsScreen.tsx

**Interfaces:**
- Produces: getMagicMomentCountdown(revealAt, now): { isReady, days, hours, minutes, seconds } | null.
- Reveal writes status='revealed' and revealed_at only for the current creator, only after reveal_at <= now().

- [ ] Write tests for invalid, future and elapsed dates.
- [ ] Run node --test tests/magic-moment-countdown.test.mjs; confirm the date-helper behavior is missing before implementation.
- [ ] Implement the date helper.
- [ ] Add a 1-second countdown update while a scheduled moment is open.
- [ ] Add a creator-only reveal button when the countdown ends and an animated reveal state after the DB update.
- [ ] Keep recipients' scheduled content governed by existing RLS.
- [ ] Run targeted tests and npm run typecheck.

### Task 5: Database migration hardening and final validation

**Files:**
- Modify: apps/kingchat/supabase/migrations/20261128160000_guftin_chat_libraries_and_defaults.sql
- Review: apps/kingchat/supabase/migrations/20261128150000_guftin_chat_experience.sql

- [ ] Revoke direct execute on the public security-definer folder seed and signup trigger functions; keep trigger behavior intact.
- [ ] Verify all new chat and LIVEVERSE tables remain RLS-enabled with membership/ownership constraints.
- [ ] Run node --test tests/*.test.mjs and npm run typecheck.
- [ ] Review the final diff and report that live Supabase migration application and APK builds remain separate deployment steps unless explicitly requested.

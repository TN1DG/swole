# New Features Progress

Six features brainstormed and scoped in a planning session (plan file: `i-want-us-to-robust-boole.md`): profile picture, rest timer, unit toggle (ft/lb), PR red-slash visual, in-app notifications, and a friends-page redesign with unified chat + text messaging. Three related ideas were explicitly deferred (animated muscle-highlight exercise demos, a public social feed, real push notifications) — not tracked here.

**Status: all six waves shipped to production** on 2026-07-28 (commit `1093d03`).

**How to use this file**: this is the *why* — the decisions, deviations, and
tradeoffs behind each wave, kept so a later session doesn't re-litigate them.
For what's still **open** (bugs, scope gaps, deferred features), see
**[`docs/backlog.md`](./backlog.md)** — that's the one to start from.

---

## Wave 1 — Units (kg/lb + ft height, Stats page only)

**Status: done** (backend + frontend + tests; not yet manually verified in the browser)

Closed a pre-existing gap: `profiles.unitPreference` has been in the schema since the beginning but no mutation ever set it and no UI ever read it (README.md:136 documented this).

Built:
- `convex/profiles.ts` — new `setUnitPreference` mutation, an exact mirror of `setWorkoutsPublic`'s shape. No schema change needed; the field already existed.
- `convex/fitness.ts` — new pure conversion helpers next to the TDEE math: `kgToLb`, `lbToKg`, `cmToFtIn`, `ftInToCm`, plus the `KG_PER_LB`/`CM_PER_INCH` constants.
- `src/features/stats/StatsPage.tsx` — a `SegmentedControl` ("Metric (cm/kg)" / "Imperial (ft/lb)") above the body-stats form, reusing the same component the Sex toggle already uses. In imperial mode the single cm field becomes two fields (ft + in) and the weight label/placeholder switch to lb.

**Key design decision — canonical storage never changes.** `heightCm`/`weightKg` remain the only units that ever reach the backend or the calorie math; the toggle is display-only. Three places handle the conversion boundary: hydration (canonical → display, once, honoring the saved preference), `handleUnitsChange` (converts whatever is currently typed so numbers don't jump when toggling, then persists the preference), and the `heightCm`/`weightKg` derivation feeding `updateBodyStats` + the live TDEE preview (display → canonical). `updateBodyStats`'s args were not touched.

**Deliberately left in kg**: the "Daily lifting goal (kg)" field further down the same page. That's a *lifted volume*, not a bodyweight — same category as the leaderboard volume the plan explicitly scoped out. Converting it would also mean reinterpreting `dailyVolumeGoalKg`'s 1–50000 validation range.

**Still showing raw kg (planned follow-up, not a bug)**: `ActiveWorkout.tsx` set inputs, `WorkoutDetailPage.tsx`, leaderboard volume. Wiring lb display through every weight-showing screen is a separate, larger piece of work.

**Tests**: `convex/fitness.test.ts` — a new `unit conversions` block (kg↔lb round trip, cm→ft/in including the 6'0" inches-rollover case, and a cm→ft/in→cm round-trip drift bound). `convex/profiles.test.ts` — a new `setUnitPreference` block including an explicit assertion that toggling to lb does NOT alter stored `heightCm`/`weightKg`.

**One test-authoring gotcha worth remembering**: `expect(x).toBeCloseTo(y, 0)` requires the difference to be *strictly* under 0.5, so the legitimate 190cm → 75in → 190.5cm round trip (exactly half an inch of rounding drift) failed it. Replaced with an explicit `Math.abs(...) <= 2.54/2` bound, which states the actual invariant instead of relying on `toBeCloseTo`'s digit semantics.

**IDE diagnostics note**: while editing, the TS language server repeatedly reported phantom "Module './fitness' has no exported member 'ACTIVITY_LEVELS'/'tdee'/..." errors for exports that plainly existed and had been working. They flapped in and out and were entirely stale — `npx tsc -b` was clean throughout. Same lesson as the MUI migration's Wave 1: trust `tsc -b`, not the editor squiggles, on this repo.

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npx vitest run` 170/170 passing (was 162 — 8 new). Pushed to the dev deployment via `npx convex dev --once`. **Not yet manually checked in a browser** — worth toggling Metric/Imperial on the Stats page and confirming a save/reload round trip before considering this fully done.

---

## Wave 2 — PR red-slash visual

**Status: done** (backend + frontend + tests; not yet manually verified in the browser)

Sets that your current PR has left behind now render with a red strikethrough — "you conquered this".

Built:
- `convex/fitness.ts` — new `behindRecord(weightKg, reps, record)` helper next to `beatsRecord`.
- `convex/history.ts` — `getDetail` now also returns `eligibleRecords`.
- `src/features/history/WorkoutDetailPage.tsx` — per-set strikethrough in the set table.
- `src/features/workouts/ActiveWorkout.tsx` — same flag live in `SetRow`.

**Key design decision — `behindRecord` is deliberately NOT `!beatsRecord`.** `beatsRecord` uses `>` on *either* axis (weight OR estimated 1RM), so its plain negation is true for a set that merely *ties* the record — which includes the very set that SET the record. That would have slashed the lifter's best set as "conquered" by itself. `behindRecord` instead requires strictly-worse on *both* axes, so a tie earns neither the trophy nor the slash. There's a test asserting the two can never both be true for the same set.

**Key design decision — the eligibility window.** A record may only be measured against (a) the workout that set it and (b) workouts logged after it. Slashing sets in *earlier* workouts would rewrite history with knowledge the lifter didn't have at the time. The filter is `r.workoutId === workout._id || workout.startedAt >= r.achievedAt`, and **the first half is not redundant**: `achievedAt` is stamped at finish time, so a PR-setting workout's own `startedAt` is always *before* its own `achievedAt` and would fail the timestamp check alone. Verified this by temporarily deleting the `workoutId` clause and confirming the new test fails — it's a real guard, not a vacuous assertion.

**Why `ActiveWorkout` doesn't need the eligibility check**: the active workout is happening now, so it's eligible by definition. It reads records straight from `prs.listMine` as it already did.

**Placement decision in `ActiveWorkout`**: the slash goes on the set-number badge only, not the weight/reps fields — those are live text inputs, and striking through what you're mid-way through typing reads as an error state rather than an achievement. In the (read-only) history table the strikethrough covers the whole row, which is the intended stronger visual.

**Not touched**: `friends.getFriendWorkoutDetail` — a friend viewing your workout won't see slashes yet. Deliberate scope limit; it'd need the same `eligibleRecords` treatment against the *owner's* records.

**Note on `--color-error`**: used `textDecorationColor: 'var(--color-error)'` rather than MUI's `'error.main'`, because `textDecorationColor` isn't one of MUI's palette-aware `sx` keys and would pass through unresolved. Confirmed `--color-error` is a real published CSS custom property (`src/theme/globalStyles.ts`, backed by `tokens.error`).

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npx vitest run` 178/178 passing (was 170 — 8 new: 6 `behindRecord` unit tests + 2 `getDetail eligibleRecords` backend tests). Pushed to dev. **Not yet manually checked in a browser** — worth logging a PR then a lower set and confirming the slash appears in both the active workout and history detail, and that an older pre-PR workout stays unslashed.

---

## Wave 3 — Rest timer

**Status: done** (built + browser-verified)

Built `src/features/workouts/RestTimer.tsx` and wired it into `ActiveWorkout.tsx`, rendered between the header stats and the exercise cards.

Behaviour: auto-starts when a set is checked off, plus a manual Start button, five duration presets (30s/1m/1m 30s/2m/3m, default 90s), +30s while running, and Skip/Dismiss.

**Key design decision — absolute end timestamp, not a decrementing counter.** `setInterval` is throttled in background tabs, so counting down by hand would drift and under-report exactly when the lifter has switched away from the app mid-rest. The component stores `endsAt` and ticks a `now` value against it, same approach as the existing `ElapsedTimer`.

**Key design decision — `autoStartSignal` is a counter, not a boolean.** Each bump (re)starts the countdown, so back-to-back sets each get a fresh rest with no flag to reset in between. `ActiveWorkout` bumps it via an `onSetCompleted` callback prop-drilled through `ExerciseCard` → `SetRow` (same path `onSaveError` already takes), fired **only** on the `false → true` transition — un-checking a set (a correction) doesn't start a rest.

**Duration lives in `localStorage`**, not the profile: it's a per-device preference that changes constantly between exercises, so it isn't worth a mutation per nudge. Access is try/catch-wrapped (private-browsing modes can throw).

**Placement decision**: the slash from Wave 2 goes on the set-number badge in the active workout rather than the weight/reps fields — those are live inputs, and striking through what you're typing reads as an error rather than an achievement.

**Bug caught by browser verification** (would have shipped otherwise): the preset label used `seconds / 60`, rendering the default 90s preset as **"1.5m 30s"**. Extracted the logic into an exported `formatPreset` with `Math.floor`, and added `src/features/workouts/RestTimer.test.ts` as a regression guard. This is the repo's **first frontend unit test** — everything else is backend `convex-test`. It works because `formatPreset` is a pure function; there's still no component-testing stack (no `@testing-library/react`/jsdom), and none was added.

**Second issue caught in the browser**: `SegmentedControl` applies `textTransform: 'capitalize'`, which mangled the Wave 1 unit labels "Metric (cm/kg)" into "Metric (Cm/Kg)". Shortened to plain "Metric"/"Imperial" — the height/weight field labels directly below already name the units, so the parenthetical was redundant.

**Known behaviour, not a bug — imperial height rounds to whole inches.** Toggling 176cm → imperial shows 5'9", and toggling back shows **175cm**. `cmToFtIn` rounds to the nearest inch, so a cm→ft/in→cm round trip can drift up to ~1.3cm; saving while in imperial mode therefore stores the rounded value. Effect on the calorie estimate is ~5 kcal (BMR 1840 → 1835), i.e. negligible. Avoiding it entirely would mean tracking whether the ft/in fields were actually edited and preserving the original cm if not — deliberately not built. Worth knowing before anyone reports "my height changed by 1cm".

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npx vitest run` 181/181 passing (was 178 — 3 new). Browser-verified end to end on the dev deployment: auto-start on set completion, live countdown, +30s, Skip returning to idle, preset selection, and the finished state ("0:00 Rest complete 💪" in green, stopping at zero rather than going negative). **Waves 1 and 2 were also browser-verified during this pass** — the Metric/Imperial toggle converts correctly both ways (176cm ↔ 5'9", 84kg ↔ 185.2lb), and the PR red-slash renders live on a sub-PR set in the active workout.

**Test data cleanup**: the throwaway workout created during verification was discarded, and the account's `unitPreference` was toggled back to Metric. Stored height/weight confirmed unchanged (176cm / 84kg) — Save was never pressed.

---

## Wave 4 — In-app notifications

**Status: done** (backend + frontend + tests + browser-verified)

Four triggers, all in-app only (no push — see the plan's Context for why). Built as **one generalized `notifications` table** rather than the bespoke-query-per-feature pattern `friends.ts`/`pings.ts` grew organically, since this is a cross-cutting concern.

Built:
- `convex/schema.ts` — new `notifications` table.
- `convex/notifications.ts` — `notify()` / `markHandled()` helpers, `listUnread` query, `markRead` mutation.
- Call sites: `friends.sendFriendRequest` / `acceptFriendRequest` / `declineFriendRequest`, `pings.send` / `acknowledge`, `workouts.finish`.
- `convex/account.ts` — deletion now clears notifications in both directions.
- `src/components/NotificationsBanner.tsx`, mounted in `AppLayout` beside `PingAckBanner`.

**Index design**: a single `by_user_readAt` (`['userId', 'readAt']`) serves both "my unread" (`eq userId` + `eq readAt undefined`) and "all mine" (userId prefix, for account deletion) — Convex indexes are usable by prefix, so no separate `by_user` was needed. A second `by_fromUser` exists solely for account deletion (below).

**`notify()` is a plain helper, not a Convex function.** Every caller is already in a mutation, so it runs in that same transaction — if the surrounding action rolls back, the notification does too. Fields are built one by one rather than spreading `args`, because `undefined` is not a valid Convex value and an absent optional has to be genuinely absent.

**`markHandled()` prevents a stale-banner bug that would definitely have been reported.** Without it: you get "Alice sent you a friend request", accept it from the Friends page, and the banner keeps saying it until you manually dismiss. So accepting/declining a request and acknowledging a ping all retire the corresponding notice. Declining also clears it whether the recipient declined or the sender withdrew.

**"Won the battle" is gated on `acknowledgedAt`.** It hooks into the existing best-effort ping-linking block in `workouts.finish`, but with a deliberately *narrower* condition than the linking itself: the link doesn't care about ack state, whereas this notification only fires if the friend actually held you accountable — which is the whole premise of the message. Also stays message-only: no points, no interaction with the challenge economy.

**Account deletion clears notifications in BOTH directions.** The first attempt only deleted ones addressed to the departing user, then tried to find ones they'd *sent* by walking their friendships — which was both convoluted and **incomplete**, since a `friend_request_received` notice goes to someone who is by definition not yet a friend. Replaced with a dedicated `by_fromUser` index and a direct query. Without this, a deleted user's notices would linger in other people's banners rendering as "Someone".

**Privacy fix caught by a failing test.** `senderName` originally mirrored `friends.ts`'s `profileFor` and fell back to `user.email`. That's fine for people you're already friends with, but a *friend-request* notice names someone you haven't accepted yet — so it would have shown a stranger's email address in your banner. Changed to fall back to `username` (already public — it's how people find each other) and never email. There's now a test asserting `fromName` contains no `@`.

**Fast-refresh lint fix (Wave 3 follow-on)**: exporting `formatPreset` from `RestTimer.tsx` tripped oxlint's `react(only-export-components)` — a component file exporting a non-component breaks React Fast Refresh. Moved `formatPreset`/`PRESETS_SEC`/`DEFAULT_SEC` into `src/features/workouts/restPresets.ts`, with the test renamed to `restPresets.test.ts`.

**Known tradeoff, unchanged from the plan**: the banner stack shows at most 3 at once and there's no notifications *page*, so beyond that they queue until earlier ones are cleared. Fine at this app's scale; a dedicated inbox page is the natural v2.

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npm run lint` clean (one pre-existing unrelated warning in `emailAuth.test.ts`), `npx vitest run` 194/194 passing (was 181 — 13 new covering all four triggers, both retire-on-handled paths, ownership on `markRead`, sender-name privacy, and two-directional deletion cleanup).

Browser-verified by seeding two rows via `npx convex import --append`, confirming both render stacked newest-first with correct copy and actions, the name resolved to the username (not the email), and dismiss marked them read and removed them. **Test rows were then deleted** (`--replace` with an empty file); `npx convex data notifications` confirms the table is empty.

---

## Wave 5 — Profile picture

**Status: done** (backend + frontend + tests + browser-verified end to end)

Upload + in-app square crop, visible to yourself and your friends. **First use of Convex file storage in this app** — nothing existed to extend.

New dependency: **`react-easy-crop` 6.2.3** (MIT, last published 3 days before install, one tiny transitive dep `normalize-wheel`). Bundle went 228.69KB → 228.70KB gzipped, i.e. effectively free.

Built:
- `convex/schema.ts` — `profiles.avatarStorageId: v.optional(v.id('_storage'))`.
- `convex/profiles.ts` — `generateAvatarUploadUrl`, `setAvatar`, `removeAvatar`; `getMine` now returns `avatarUrl`.
- `convex/friends.ts` — new `profileForWithAvatar` helper.
- `convex/rateLimiter.ts` — new `avatarUploadUrl` limit.
- `convex/account.ts` — deletion frees the avatar blob.
- `src/components/Avatar.tsx`, `src/lib/cropImage.ts`, `src/features/profile/AvatarUploadDialog.tsx`, `src/features/profile/useAvatarPicker.ts`.
- Wired into ProfilePage, FriendsPage (friend rows + leaderboard), FriendChatPage header, and the AppLayout header icon.

**Real bug caught by a test — `delete` + `throw` cancels the delete.** `setAvatar` originally did `await ctx.storage.delete(badBlob)` then `throw new ConvexError(...)`. Convex mutations are all-or-nothing, so the throw rolled the delete back and left the rejected blob orphaned in storage forever — the exact semantics already documented at the top of `convex/rateLimiter.ts`, hit again from a new angle. **Fix: `setAvatar` returns `{ ok: false, error }` instead of throwing**, so the cleanup commits; the client turns a false result back into a thrown error. There's a regression test asserting storage is empty after a rejection.

**Why the `contentType` check tolerates a missing type.** `contentType` comes from the client's own upload header, so it is **not a security boundary** — anyone malicious simply claims `image/png`. Its real value is catching honest mistakes (picking a PDF). Rejecting a *missing* type would therefore buy nothing an attacker couldn't sidestep, while breaking any uploader that omits the header — and it made the behaviour untestable, since **convex-test's `storage.store` records only `sha256` and `size`, never a `contentType`**. So: strict when present, tolerant when absent. `size` is measured server-side and is the check that actually bites. Confirmed against the real deployment that Convex *does* record `contentType` (`image/jpeg`) for genuine uploads, so the check is live in production.

**Avatars are deliberately NOT on the username-search path.** `profileForWithAvatar` is a separate helper rather than folding `avatarUrl` into the shared `profileFor`, because `profileFor` also backs `resolveUsername` — which any signed-in stranger can call. Folding it in would hand a stranger your photo just for guessing your username. There's a test asserting `resolveUsername`'s result has no `avatarUrl` property. Pending friend-request rows (`myIncomingRequests`/`myOutgoingRequests`) also stay avatar-free, matching the agreed "self and friends" scope — easy to relax later by swapping which helper they call.

**`generateAvatarUploadUrl` is rate-limited.** Each call is a licence to write a blob into storage, and a client that requests one but never calls `setAvatar` leaves an orphan behind. Capped at 10/min (burst 5), far above what re-cropping a photo needs.

**Fast-refresh lint fix (same class as Wave 4's)**: `useAvatarPicker` initially lived in `AvatarUploadDialog.tsx`; a component file exporting a non-component breaks React Fast Refresh. Moved to `src/features/profile/useAvatarPicker.ts`.

**Client-side crop details**: output is a 512×512 JPEG at quality 0.9 — a 13KB PNG source came out as a 9.5KB JPEG. The canvas is pre-filled black because JPEG has no alpha and an un-painted background would otherwise render black anyway (explicit beats incidental). The full-size original never leaves the device. The object URL is revoked on change/unmount so repeated re-crops don't leak blob URLs.

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npm run lint` clean (one pre-existing unrelated warning), `npx vitest run` 203/203 passing (was 194 — 9 new: attach, replace-frees-old, oversize-rejection-and-cleanup, remove, no-op remove, sign-in, friend visibility, stranger non-visibility, deletion cleanup).

Browser-verified the whole round trip on the dev deployment: picked a file, cropped it in the dialog, saved, and confirmed the avatar appeared on the profile card, in the app header, and that `_storage` held one 9.5KB `image/jpeg`. Then used "Remove photo" and confirmed `_storage` was empty and `avatarStorageId` gone from the profile row. **Account left in its original state** (no avatar, `unitPreference` kg, 176cm/84kg).

---

## Wave 6 — Friends page redesign (unified chat + text messaging + unread badges)

**Status: done** (backend + frontend + tests + browser-verified)

The friend chat page is now one chronological conversation mixing text messages, gym pings, and challenge status, with Ping and Challenge side by side at the bottom.

Built:
- `convex/schema.ts` — new `messages` and `threadReads` tables.
- `convex/messages.ts` — `send` mutation plus `messagesBetween`/`latestIncomingMessageAt` helpers.
- `convex/friendThread.ts` — `getThread` (the merged thread), `markRead`, `unreadFriendIds`.
- Refactored `convex/pings.ts` and `convex/challenges.ts` to export `pingsBetween`/`challengesBetween`, with their own `getThread` queries becoming thin wrappers.
- `convex/validation.ts` (`messageMaxLength`), `convex/rateLimiter.ts` (`messageSend`), `convex/account.ts` (deletion cleanup).
- `src/features/friends/FriendChatPage.tsx` (substantial rewrite), `ChallengeComposeDialog.tsx`, unread dot in `FriendsPage.tsx`.

**Reuse over duplication**: the merged thread calls `pingsBetween`/`challengesBetween`/`messagesBetween` as **plain functions**, not via `ctx.runQuery`. It's all one transaction already, so a direct call is cheaper and keeps each domain's fetch logic in exactly one place. The old `pings.getThread`/`challenges.getThread` queries still exist as thin wrappers — they're focused, tested, and cheap to keep.

**Challenges are one entry, not an event log.** There's no per-transition history to build from, so each challenge renders as a single card showing its *current* status, positioned at `resolvedAt ?? startedAt ?? createdAt`. That positioning is deliberate: an open or just-decided challenge sorts to the bottom of the thread where it'll actually be seen, rather than staying buried at the moment it was proposed. A test asserts a challenge stays one entry but moves after a message once accepted. A true per-transition log would need a new append-only table — worth doing only if the single-card version proves insufficient.

**No friendship gate on thread reads, deliberately.** Every source query is scoped to the (me, them) pair, so a non-friend simply gets an empty thread — the gate lives on the *writes* (`messages.send`, `pings.send`, `challenges.propose`). An `areFriends` helper was written here and then deleted as dead code; there's a test asserting a stranger sees an empty thread.

**`unreadFriendIds` is its own query, deviating from the plan's "extend `myFriends`".** `myFriends` is also loaded by the chat page (for the header) and other views that don't care about unread state; folding in three extra reads per friend would have slowed all of them for one screen's benefit. Separate query, separate subscription, no cost where it isn't used.

**Messages deliberately raise no notification.** One banner per incoming message would bury everything else; the per-thread unread dot on the Friends list is the right surface for chat. `messageSend` is also rate-limited far more loosely than pings/challenges (30/min, burst 15) because a real back-and-forth shouldn't feel throttled.

**Account deletion** removes messages in both directions and the departing user's own read markers. The *friend's* read marker pointing back at them is intentionally left: it's a harmless timestamp keyed by a now-dead friendId, and finding those would need an index that exists for nothing else.

**A false alarm worth recording**: mid-verification the browser threw repeated `Page.captureScreenshot` timeouts right after the chat page mounted, which looked like an infinite `markRead` loop (the effect's deps included both `thread` and `thread?.length`). Checked it properly instead of guessing — `threadReads` held exactly one row and its `lastReadAt` was stable across a 4-second window, so there was no write loop; the timeouts were browser flakiness that had also appeared in earlier waves. The redundant `thread?.length` dep was tightened anyway, with a comment noting why the effect can't feed back into itself (`getThread` doesn't read `threadReads`).

**Verification**: `npx tsc -b` clean, `npm run build` clean, `npm run lint` clean (one pre-existing unrelated warning), `npx vitest run` 217/217 passing (was 203 — 14 new: send/permission/validation, stranger-sees-nothing, chronological interleaving, challenge-stays-one-entry-and-repositions, four unread cases, deletion cleanup).

Browser-verified against a seeded second account: the unread dot on the friend row, the merged thread rendering messages + a ping + a challenge card in correct chronological order, sending a real message (appeared right-aligned, input cleared, auto-scrolled), and the challenge compose dialog.

**Test data fully removed (see also the cleanup pass at the end of this doc).** `challenges`/`gymPings`/`friendships`/`messages`/`threadReads` were wiped (every row in them was seeded — the account had none before). The seeded user and profile were deleted via a **temporary internal mutation**, since `convex import --replace` on `users` would have minted a new `_id` and orphaned every workout. That mutation was deleted and the deployment re-pushed; `convex function-spec` confirms it's gone. Verified afterwards: the real user retains its original `_id`/`_creationTime`, both workouts intact, all seeded tables empty.

---

## Cleanup pass (after Wave 6)

**Status: done**

Deduplication and one real efficiency fix, run across everything the six waves added.

**`areFriends` consolidated.** Four byte-identical copies had accumulated (`friends.ts`, `pings.ts`, `challenges.ts`, `messages.ts`), each carrying a comment explaining that the repo convention was to keep a private copy per domain file. By the fourth copy that convention was costing more than it saved — and `friendThread.ts` already imports across domain files anyway. Now a single `convex/friendships.ts` helper module (no Convex functions in it, so nothing is exposed to clients).

**Test fixtures consolidated.** `userWithUsername` had **seven** identical definitions; `twoFriends` four, `makeFriends` four, `givePoints` two. All now live in `convex/test.helpers.ts`.
- *Deliberate behaviour change*: the shared `twoFriends` inserts friendship rows directly, whereas `friends.test.ts`/`pings.test.ts`/`challenges.test.ts` previously ran the real `sendFriendRequest` → `acceptFriendRequest` flow as setup. Going through the real mutations also consumed that flow's rate limit and raised friend-request notifications that unrelated tests then had to filter past. The real accept flow is still explicitly covered by its own tests in `friends.test.ts`, so this trades incidental coverage in setup for isolation — no net loss.

**Real efficiency fix — duplicate profile read per friend.** Wave 5's `profileForWithAvatar` called `profileFor(...)` *and* separately queried the same `profiles` row, so every friend cost two identical index reads. Since `myFriends` and `leaderboard` call it once per friend, that was a duplicated read across the entire list. Both now build on one `identityOf` helper that reads the user + profile pair exactly once.

**Lint is now completely clean** (zero warnings). Fixed the last one — a genuinely unused `fetchMock` binding in `emailAuth.test.ts` that predated this work; the `mockFetchOk()` call is still needed to stub the send, just not the binding.

**Two process lessons worth keeping:**
1. **Regex-driven multi-file edits are dangerous.** A lazy `[\s\S]*?` intended to match one import block instead spanned from the file's *first* `import {` through to `test.helpers`, merging unrelated import statements across six files and breaking 60 tests. The test bodies were untouched, so the fix was to rebuild each header from actual usage — but the lesson is to prefer explicit per-file edits over clever patterns.
2. **`tsc -b` does not cover `convex/*.test.ts`.** After the import repair, root `tsc -b`, vitest, and lint were all green while `npx convex dev` still failed with 5 type errors — `asUser` was missing from two files, used only in type position (`ReturnType<typeof asUser>`) which the usage scan had missed. **`npx tsc --noEmit -p convex` is the check that catches this**; it belongs alongside `tsc -b` before any deploy. (Related to the MUI migration's note that `tsc --noEmit` alone isn't trustworthy on this repo.)

**Bundle deliberately not code-split.** The 500KB chunk-size warning is real, but the weight is MUI + the Convex client + React, which every route needs — `react-easy-crop` and `modern-screenshot` are small by comparison. The app is also a PWA that precaches its entire bundle, so splitting mostly changes how the same bytes are packaged rather than how many are fetched. Skipped as risk without benefit; revisit if initial load becomes a measured problem.

**Verification**: `npx tsc -b` clean, `npx tsc --noEmit -p convex` clean, `npx vitest run` 217/217, `npm run lint` clean (zero warnings), `npm run build` clean.

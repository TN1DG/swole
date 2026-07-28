# Backlog

Everything known-open as of the 2026-07-28 deploy (commit `1093d03`, live on
production). Ordered by priority. Companion to `docs/new-features-progress.md`,
which has the wave-by-wave *why* behind the six features that just shipped —
this file is the *what's left*.

> **2026-07-28, mobile pass.** A responsiveness sweep landed after the above;
> see `docs/mobile-responsiveness.md` for what changed and what it means for
> new code (short version: never hardcode the header or tab-bar height, use
> `var(--app-header-h)` / `var(--app-nav-h)`; give any flexible text column
> `minWidth: 0`). Not yet verified on a physical phone.

**Start here next session.** Each item says what's wrong, where, and what the
fix involves. Nothing below is blocking the live app except P1.

---

## P1 — Real bugs

### 1. `deleteAccount` leaves `gymPings` and `challenges` behind

`convex/account.ts` cleans 20 tables but **not** `gymPings` or `challenges`.
Confirmed by comparing its queries against `convex/schema.ts`. This predates
the six features (it was noted during Wave 6 planning and never fixed).

Consequences, worst first:
- **Escrowed points are lost forever.** A `pending`/`active` challenge
  involving a deleted user never resolves, so the surviving friend's wager
  stays debited from their balance with no path to a refund.
- **The resolve cron corrupts data.** `challenges.resolveExpired` (run by
  `convex/crons.ts`) will pick up an `active` challenge past `endsAt` and call
  `awardPoints` on the deleted user → `getOrCreateProfile` → **inserts a fresh
  `profiles` row whose `userId` points at a user document that no longer
  exists.** Every run adds another orphan.
- Orphaned pings still render in the surviving friend's chat thread, with the
  sender's name falling back to `'?'` (`profileFor` in `convex/friends.ts`).

Fix sketch, in `deleteAccount`:
- Delete `gymPings` via `by_from` and `by_to` (mirror the `messages` block
  added in Wave 6 — it's the same shape).
- For `challenges` via `by_challenger` and `by_opponent`: **refund the other
  side's escrow before deleting** any row still `pending` or `active`
  (`awardPoints(ctx, survivorId, wagerPoints)`), otherwise deletion silently
  burns their points. Already-`resolved`/`declined`/`cancelled` rows can just
  be deleted.
- Add a test alongside the existing cleanup tests in
  `convex/friendThread.test.ts` / `convex/notifications.test.ts`.

---

## P2 — Shipped but unverified

### 2. Notification tap-through actions never exercised end to end
Backend paths are covered by `convex/notifications.test.ts`, and the banners
were confirmed to render and dismiss. But the *actions* were never driven with
two real accounts: one-tap ping acknowledge, and the deep-link to a friend's
workout (`/friends/:userId/:workoutId`). Now live — worth a real check.
Component: `src/components/NotificationsBanner.tsx`.

### 3. Production holds 4 orphaned `emailSendAttempts` rows
The table was removed from the schema in the rate-limiting work; production
still has 4 rows containing **real user email addresses**. No code reads them
and the deploy accepted it, so this is tidiness/privacy rather than function.
Left deliberately rather than delete production data unasked. Note the table is
no longer in the schema, so `convex import --replace` may not target it — a
one-off internal mutation is the reliable route (see the Wave 6 cleanup notes
for that pattern).

---

## P3 — Deliberate scope gaps (each is a small, self-contained follow-up)

4. **lb/ft is Stats-page only.** `ActiveWorkout.tsx` set inputs,
   `WorkoutDetailPage.tsx`, and leaderboard volume still show raw kg.
   `profiles.unitPreference` is now wired and readable, so this is display
   plumbing plus `kgToLb` from `convex/fitness.ts`.
5. **PR "conquered" slash is absent for friends.** `history.getDetail` returns
   `eligibleRecords`; `friends.getFriendWorkoutDetail` needs the same treatment
   against the *owner's* records.
6. **Avatars are absent on pending friend-request rows.**
   `myIncomingRequests`/`myOutgoingRequests` use plain `profileFor`. Swapping
   them to `profileForWithAvatar` is a one-line change each — it was held back
   only to match the agreed "self and friends" scope.
7. **No notifications inbox.** The banner stack shows at most 3 and there's no
   page; beyond that they queue until earlier ones clear. A `/notifications`
   route reading `notifications.listUnread` is the natural v2.

---

## P4 — Known behaviours (decide, don't "fix" blindly)

8. **Imperial height rounds to whole inches.** 176cm → 5'9" → back to 175cm;
   up to ~1.3cm drift, and saving while in imperial stores the rounded value
   (~5 kcal of TDEE). Avoiding it means tracking whether the ft/in fields were
   actually edited and preserving the original cm if not.
9. **Daily lifting goal stays kg** even in imperial — it's a lifted *volume*,
   not a bodyweight, and its 1–50000 validation range is defined in kg.
10. **A challenge is one thread entry, not an event log.** It shows current
    status, positioned at `resolvedAt ?? startedAt ?? createdAt`. Per-transition
    history would need a new append-only table.
11. **Account deletion leaves the friend's `threadReads` row** pointing at the
    departed user. Harmless timestamp; finding them would need an index that
    exists for nothing else.
12. **Avatar `contentType` check tolerates a missing type.** It's client-asserted
    and therefore not a security boundary; `size` is the real guard. See
    `convex/profiles.ts:setAvatar` for the full reasoning before "tightening" it.

---

## P5 — Security follow-ups (from the audit session)

13. **`resolveUsername` enumeration is unthrottled.** It's a reactive `query`,
    and the rate limiter needs write access, so throttling means converting it
    to a `mutation` and changing how `FriendsPage` calls it. Low severity — it
    only reveals whether a username exists — so it was left as documented
    residual risk.
14. **Signup throttle is global, not per-IP.** `rateLimiter.signUp` is 20 per
    10 minutes app-wide because Convex actions can't see caller IP. It stops
    scripted floods, not a slow distributed trickle. The real fix is a
    challenge on the signup form (e.g. Cloudflare Turnstile) — outside Convex.
15. **`npm audit`: 10 high, but only 2 root causes**, both previously assessed
    and deliberately deferred (also recorded in `docs/mui-migration-progress.md`):
    - `react-router` RSC-mode CSRF — only exploitable in RSC mode, which this
      client-only SPA does not use.
    - `brace-expansion` DoS — reaches us only through
      `vite-plugin-pwa → workbox-build`, i.e. build-time, never shipped.
    Both need breaking downgrades via `--force`. Re-evaluate when either
    upstream ships a non-breaking fix.

---

## P6 — Deferred features (the actual product backlog)

These were scoped out during the planning session with explicit reasoning —
they are not oversights.

16. **Animated exercise demos with muscle highlighting.** Blocked on an asset
    decision, not on code. Options weighed: static body-silhouette diagrams per
    exercise (feasible now, no licensing), a third-party exercise GIF/video API
    (external dependency, cost, won't cover user-created custom exercises), or
    commissioned animations (highest quality, slowest). `exercises` has no media
    field today (`convex/schema.ts`), and `seedData.ts` has no image data —
    this needs a schema field plus slots in `ExercisesPage`/`ExerciseDetail`/
    `ExercisePicker`.
17. **Public social feed.** You chose *public across all app users*, not
    friends-only — that's a genuine privacy/model shift from today's
    friends-gated visibility (`workoutsPublic` is currently the only opt-in),
    so it deserves its own design pass rather than being bolted on.
18. **Real push notifications.** The app has zero push infra: no service-worker
    push handler, no permission flow, no subscription table (`vite-plugin-pwa`
    is asset-caching only). The `notifications` table was deliberately designed
    so push can layer on top without reworking the data model — a push sender
    would read the same rows.

---

## P7 — Tooling & maintenance

19. **Add `tsc --noEmit -p convex` to the verify routine.** `tsc -b` does *not*
    typecheck `convex/*.test.ts`. During cleanup, root typecheck + vitest + lint
    were all green while `npx convex dev` failed with 5 type errors. Worth a
    `"typecheck": "tsc -b && tsc --noEmit -p convex"` script in `package.json`
    so it can't be forgotten.
20. **Convex patch available**, 1.42.1 → 1.42.3.
21. **Bundle is 229KB gzipped** with a >500KB chunk warning. Code splitting was
    deliberately skipped: the weight is MUI + Convex client + React (needed by
    every route), and this is a PWA that precaches the whole bundle, so
    splitting mostly repackages the same bytes. Revisit only if initial load
    becomes a measured problem.

---

## Verification commands

```
npx tsc -b                  # app + convex source
npx tsc --noEmit -p convex  # ALSO covers convex/*.test.ts — see P7 #19
npx vitest run              # 217 tests
npm run lint                # currently zero warnings
npm run build
npx convex dev --once       # push to dev
npm run deploy              # convex prod + vercel prod
```

## Gotchas worth re-reading before you start

- **Convex mutations are all-or-nothing.** A `ctx.storage.delete()` or
  rate-limiter consumption followed by a `throw` in the same mutation gets
  rolled back with everything else. This bit twice this session — see
  `convex/profiles.ts:setAvatar` (returns a result instead of throwing) and the
  comment at the top of `convex/rateLimiter.ts`.
- **The IDE's TypeScript diagnostics go stale on this repo**, reporting phantom
  "no exported member" errors for exports that exist. Trust `tsc -b`.
- **Prefer explicit per-file edits over regex sweeps.** A lazy `[\s\S]*?`
  intended to match one import block spanned six files' entire import headers
  and broke 60 tests during cleanup.

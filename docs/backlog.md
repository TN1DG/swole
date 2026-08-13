# Backlog

Everything known-open as of **2026-08-04**. Ordered by priority. Companion to
`docs/new-features-progress.md` (the wave-by-wave *why* behind shipped
features), `docs/domain-and-environments-plan.md` (the deploy pipeline,
domain, and preview-environment story), and `docs/project-review-2026-08-13.md`
(repo/CI/architecture review — read its "Open items" list alongside this one).
This file is the *what's left*.

> **Updated 2026-08-13.** Several counts below are stale: the suite is now
> **333 tests across 23 files**, and `npm audit` is **5 high**, not 4 — see items
> 14 and 20, and §3.3 of the project review. CI now exists
> (`.github/workflows/ci.yml`) and runs the verify routine on every push and PR.

**Start here next session.** Each item says what's wrong, where, and what the
fix involves.

---

## Current state

- **Live at <https://swole.day>** (bought 2026-08-04). `www` redirects to the
  apex; `staging.swole.day` is bound to the `staging` branch behind Vercel SSO.
- **Branch workflow: `dev` → `staging` → `main`**, each hop via a PR. `main` is
  protected and is production. **Commit new work to `dev`.**
- **Preview deployments are self-sufficient.** Every non-production branch gets
  its own Convex deployment; `scripts/vercel-build.js` seeds the exercise
  library and sets the auth keys automatically. Deployments are now *reused*
  across pushes (`--preview-name`), so test accounts survive.
- **312 tests, 21 files.** Verify with:

```
npm run typecheck    # tsc -b && tsc --noEmit -p convex  (both matter)
npx vitest run
npm run lint         # currently zero warnings
npm run build
```

---

## P1 — Real bugs

*Nothing open.* The `deleteAccount` orphan bug (`gymPings`/`challenges` plus
escrow refund) was fixed 2026-07-28 and is covered by `convex/account.test.ts`.

---

## P2 — Shipped but unverified

### 1. Notification tap-through actions never exercised end to end
Backend paths are covered by `convex/notifications.test.ts`, and the banners
render and dismiss. But the *actions* were never driven with two real accounts:
one-tap ping acknowledge, and the deep-link to a friend's workout
(`/friends/:userId/:workoutId`). Component: `src/components/NotificationsBanner.tsx`.
Now that staging keeps its data between pushes, this is much easier to test.

### 2. ~~Orphaned `emailSendAttempts` rows in production~~ — DONE 2026-08-04
`migrations:dropOrphanedEmailSendAttempts` was run against production and
deleted **6 rows** (this file previously estimated ~4 — the estimate was low).
The table is now empty, verified with `npx convex data emailSendAttempts
--prod`, and a second run returned `{deleted: 0}`, confirming idempotency.
Production served HTTP 200 throughout.

The empty table itself still appears in the table listing. That's harmless —
it holds no documents, and the privacy concern was the rows.

Two things worth keeping from the exercise:

- **Removing a table from `convex/schema.ts` does not remove its rows.** They
  simply stop being validated, and stop being visible to typed queries. Reaching
  them again needs a cast, because the generated `DataModel` no longer declares
  the table. Anything dropped from the schema in future leaves its data behind
  the same way.
- **A migration can only run where it's deployed.** `--prod` failed with "Could
  not find function" until the promotion reached `main`, because production runs
  `main`'s code. The shortcut — `npm run deploy` — would have worked by pushing
  all of `dev` straight to production and bypassing both PR gates. Don't.

---

## P3 — Scope gaps

### 3. lb/ft is still mostly Stats-page only — *bigger than it looks*
`profiles.unitPreference` is wired and readable, and `kgToLb`/`lbToKg` live in
`convex/fitness.ts`, but only `StatsPage.tsx` uses them.

The previous version of this backlog called this "display plumbing" in three
places. That was an undercount — a survey on 2026-08-04 found **~20 display
sites across a dozen files** (`ExerciseDetail`, `ExercisesPage`, `PostCard`,
`FriendWorkoutDetailPage`, `FriendWorkoutsPage`, `CalendarView`, `HistoryPage`,
`WorkoutDetailPage`, `ActiveWorkout`, the leaderboard in `FriendsPage`…), all
using the `{formatKg(x)} kg` pattern. Doing it properly needs:

1. A shared hook (e.g. `useWeightUnit()`) so each site doesn't separately fetch
   the profile.
2. Explicit per-file edits. **Do not regex-sweep this** — a lazy `[\s\S]*?`
   across these files broke 60 tests during an earlier cleanup.
3. Test updates, since some tests assert on `kg` strings.
4. **`ActiveWorkout.tsx` set inputs are a separate, riskier problem.** Those are
   *inputs*, not display: the canonical store is kg, so entering in lb means
   converting on save. Keep full precision on the stored kg and only convert
   fields the user actually edited, or it drifts on every save — the same shape
   as the imperial-height issue in P4 below.

Recommend splitting: display layer first (safe, mechanical), inputs as a
deliberate second pass.

### 4. PR "conquered" slash is absent for friends
`history.getDetail` returns `eligibleRecords`; `friends.getFriendWorkoutDetail`
needs the same treatment against the *owner's* records.

### 5. ~~Avatars absent on pending friend-request rows~~ — DONE 2026-08-04
Incoming requests now show the sender's avatar (`myIncomingRequests` uses
`profileForWithAvatar`, and `FriendsPage` renders it).

**Outgoing requests deliberately still don't**, and this is not an oversight —
see the comment on `myOutgoingRequests` in `convex/friends.ts`. Usernames are
resolvable by anyone via `resolveUsername`, so returning an avatar there would
let anyone harvest any user's photo by looking them up and sending a request
the target never accepts. The old backlog's "one-line change each" was right
about incoming and wrong about outgoing.

---

## P4 — Known behaviours (decide, don't "fix" blindly)

6. **Imperial height rounds to whole inches.** 176cm → 5'9" → back to 175cm; up
   to ~1.3cm drift, and saving while in imperial stores the rounded value
   (~5 kcal of TDEE). Avoiding it means tracking whether the ft/in fields were
   actually edited and preserving the original cm if not.
7. **Daily lifting goal stays kg** even in imperial — it's a lifted *volume*,
   not a bodyweight, and its 1–50000 validation range is defined in kg.
8. **A challenge is one thread entry, not an event log.** Shows current status,
   positioned at `resolvedAt ?? startedAt ?? createdAt`. Per-transition history
   would need a new append-only table.
9. **Account deletion leaves the friend's `threadReads` row** pointing at the
   departed user. Harmless timestamp; finding them would need an index that
   exists for nothing else.
10. **Avatar `contentType` check tolerates a missing type.** Client-asserted and
    therefore not a security boundary; `size` is the real guard. See
    `convex/profiles.ts:setAvatar` before "tightening" it.
11. **Comment authors on a public post are visible to strangers** (the composer
    says so), and reports have no moderator UI — they're read from the Convex
    dashboard, like `featureRequests`.

---

## P5 — Security follow-ups

12. **`resolveUsername` enumeration is unthrottled.** It's a reactive `query`,
    and the rate limiter needs write access, so throttling means converting it
    to a `mutation` and changing how `FriendsPage` calls it. Low severity — it
    only reveals whether a username exists — so documented residual risk.
    Note it's also what makes the outgoing-avatar leak in #5 real.
13. **Signup throttle is global, not per-IP.** `rateLimiter.signUp` is 20 per
    10 minutes app-wide because Convex actions can't see caller IP. Stops
    scripted floods, not a slow distributed trickle. Real fix is a challenge on
    the signup form (e.g. Cloudflare Turnstile) — outside Convex.
14. **`npm audit`: 4 high, one root cause** (was 10 high / 2 causes; the
    `brace-expansion` chain resolved upstream). What remains is the
    `react-router` RSC-mode CSRF advisory, only exploitable in RSC mode, which
    this client-only SPA does not use. `npm audit fix --force` would downgrade
    `react-router` — **don't**. Re-evaluate when upstream ships a non-breaking fix.

---

## P6 — Deferred features

15. **Real push notifications.** *The one that matters for the mobile app.* The
    app has zero push infra: no service-worker push handler, no permission flow,
    no subscription table (`vite-plugin-pwa` is asset-caching only). The
    `notifications` table was deliberately designed so push can layer on top
    without reworking the data model — a push sender would read the same rows.
    A proper project, not an afternoon.
16. **Mobile app deep linking.** Universal Links need
    `https://swole.day/.well-known/apple-app-site-association`; App Links need
    `assetlinks.json`. Both are static files under `public/`. The catch-all SPA
    rewrite in `vercel.json` is *not* the risk (Vercel only rewrites when
    nothing matches on disk) — the thing to check is whether Vite copies a
    dot-directory out of `public/` into `dist/`. See
    `docs/domain-and-environments-plan.md`.
17. **Animated exercise demos with muscle highlighting.** Blocked on an asset
    decision, not code. `exercises` has no media field and `seedData.ts` has no
    image data; needs a schema field plus slots in `ExercisesPage`/
    `ExerciseDetail`/`ExercisePicker`.

---

## P7 — Tooling & maintenance

18. ~~Add `tsc --noEmit -p convex` to the verify routine.~~ **DONE 2026-08-04** —
    `npm run typecheck` runs both. `tsc -b` alone does *not* typecheck
    `convex/*.test.ts`; root typecheck + vitest + lint were once all green while
    `npx convex dev` failed with 5 type errors.
19. **Convex patch available**, 1.42.1 → 1.42.3 (or newer — re-check).
20. **Bundle is ~229KB gzipped** with a >500KB chunk warning. Code splitting was
    deliberately skipped: the weight is MUI + Convex client + React, needed by
    every route, and this is a PWA that precaches the whole bundle. Revisit only
    if initial load becomes a measured problem.
21. **Preview `--preview-run` logs no output on reuse builds**, where a fresh
    deployment logs `"Seeded 70 exercises."`. Seeded state is correct either
    way; the first-deploy path is the one that matters for a new branch. Look
    here if a new branch ever comes up with an empty exercise library.
22. ~~**There is at least one flaky test.**~~ — **FOUND AND FIXED 2026-08-04.**
    It was `convex/emailAuth.test.ts > sign up > throttles a flood of
    new-account creation app-wide`, and it was **a timeout, not a logic bug** —
    which is why the summary said "1 failed" with no assertion error and no
    test name.

    The test must create 21 accounts to trip a limit of 20, and each sign-up
    runs a real password hash. Measured across five runs it takes
    **3993–4848ms**, against vitest's **5000ms** default. Routinely within 3–20%
    of the ceiling, so any load spike tips it over. It first appeared while
    several `npx` commands were running concurrently.

    Fixed with an explicit `{ timeout: 30_000 }` on that one test. Deliberately
    *not* a raised global timeout: every other test finishes in under 700ms, and
    a 5s default is what catches a genuinely hung one.

    **Method worth reusing.** Brute repetition was the wrong tool — 26 runs,
    including shuffled ones, never reproduced it. What found it in one run was
    `npx vitest run --reporter=verbose` and sorting by duration: the culprit was
    the only test in the suite anywhere near the limit. If another mystery flake
    appears, check durations against the timeout before hunting for a race.

---

## Shipping a release

Users see a "What's new" popup once per release. To publish one, add an entry
at the **top** of `RELEASES` in `src/features/releases/releaseNotes.ts` with a
version string nobody has seen before, then deploy. Everyone whose account
predates `releasedAt` gets it once; newer accounts never do (they get the
welcome carousel). Dismissal is stored per-account in
`profiles.lastSeenRelease`, so it doesn't reappear on their other devices. It
stays re-readable from Profile → "What's new".

## Gotchas worth re-reading before you start

- **Convex mutations are all-or-nothing.** A `ctx.storage.delete()` or
  rate-limiter consumption followed by a `throw` in the same mutation is rolled
  back with everything else. This bit twice — see `convex/profiles.ts:setAvatar`
  (returns a result instead of throwing) and the comment at the top of
  `convex/rateLimiter.ts`.
- **Don't name a cause you haven't checked in a user-facing error.** Sign-up
  spent a session blaming "password must be at least 8 characters" for a
  deployment with no auth keys — a cause the input's own `minLength: 8` made
  nearly impossible. `errorMessage(err, fallback)` returns the fallback for
  *anything* that isn't a `ConvexError`.
- **The IDE's TypeScript diagnostics go stale on this repo**, reporting phantom
  "no exported member" errors for exports that exist. Trust `npm run typecheck`.
- **Prefer explicit per-file edits over regex sweeps.** A lazy `[\s\S]*?`
  intended to match one import block spanned six files' entire import headers
  and broke 60 tests.
- **`vercel.json`'s security headers only exist in production.** The Vite dev
  server serves no CSP at all, so a policy that blocks something is invisible
  locally and 100% reproducible once deployed. This shipped a broken feature
  once: `img-src` was missing `https://*.convex.cloud`, so every avatar in
  production silently rendered as the fallback initial. CSP failures are
  console-only — nothing in the UI says "blocked".
- **A header-only change cannot reach an installed PWA.** The service worker
  precaches `index.html`, and a navigation served from the Cache API carries the
  headers it was cached with. `vite.config.ts` mirrors the policy into a
  build-only `<meta http-equiv>` tag (`cspMetaTag`) so it travels with the shell
  it applies to; `vercel.json` stays the source of truth and
  `vercel-headers.test.ts` pins both copies.
- Anything loaded from a new origin — fonts, analytics, remote images — needs a
  CSP entry, a rebuilt `index.html`, *and* a check that the live `curl -sI`
  response actually carries it.

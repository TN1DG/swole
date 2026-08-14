# Backlog

**As of 2026-08-13, the work queue lives in [GitHub Issues](https://github.com/TN1DG/swole/issues), not in this file.**

A prose list is good for a human picking up context and useless as a queue —
there is nothing to claim, assign, block, or close. Every actionable item that
was numbered here is now an issue. This file keeps what is *not* issue-shaped:
the current state, the behaviours that are deliberate, and the gotchas worth
re-reading before you start.

Companion to `docs/new-features-progress.md` (the wave-by-wave *why* behind
shipped features), `docs/domain-and-environments-plan.md` (deploy pipeline,
domain, preview environments), `docs/security-audit.md` (the `convex/` audit and
the Turnstile runbook), and `docs/project-review-2026-08-13.md` (repo, CI, and
architecture review).

---

## Current state

- **Live at <https://swole.day>.** `www` redirects to the apex;
  `staging.swole.day` is bound to the `staging` branch behind Vercel SSO.
- **Public repo, MIT licensed** since 2026-08-13.
- **Branch workflow: `dev` → `staging` → `main`**, each hop via a PR.
  **Commit new work to `dev`.** `main` is now *mechanically* protected — merging
  requires a PR and a green `verify` check.
- **CI runs on every push and PR** (`.github/workflows/ci.yml`): typecheck, lint,
  tests, build.
- **Preview deployments are self-sufficient.** Every non-production branch gets
  its own Convex deployment; `scripts/vercel-build.js` seeds the exercise library
  and sets the auth keys automatically. Deployments are *reused* across pushes
  (`--preview-name`), so test accounts survive.
- **333 tests, 23 files.** Both TS projects are `strict`.

```
npm run typecheck    # tsc -b && tsc --noEmit -p convex  (both matter)
npx vitest run
npm run lint         # currently zero warnings
npm run build
```

`npm run deploy:emergency` bypasses all of the above and ships straight to
production. It is named for what it is. Use the PR flow.

---

## Open work

Full list, with labels and blocking state:
**<https://github.com/TN1DG/swole/issues>**

| # | Item | State |
| --- | --- | --- |
| [#19](https://github.com/TN1DG/swole/issues/19) | Stale cached shell hits a dead end when Turnstile is enabled | closed 2026-08-14 |
| [#20](https://github.com/TN1DG/swole/issues/20) | Verify notification tap-through actions end to end | `ready-for-human` |
| [#21](https://github.com/TN1DG/swole/issues/21) | Wire `unitPreference` into the ~20 remaining kg display sites | closed 2026-08-14 |
| [#22](https://github.com/TN1DG/swole/issues/22) | Enter set weights in lb without precision drift | `ready-for-human`, unblocked by #21 |
| [#23](https://github.com/TN1DG/swole/issues/23) | PR "conquered" slash missing on a friend's workout detail | closed 2026-08-14 |
| [#24](https://github.com/TN1DG/swole/issues/24) | Throttle `resolveUsername` to stop username enumeration | closed 2026-08-14 |
| [#25](https://github.com/TN1DG/swole/issues/25) | Re-triage `npm audit` — now 5 high, up from 4 | closed 2026-08-14, now 0 |
| [#26](https://github.com/TN1DG/swole/issues/26) | Real push notifications | `ready-for-human` |
| [#27](https://github.com/TN1DG/swole/issues/27) | Deep-link association files for Universal Links / App Links | `ready-for-human` |
| [#28](https://github.com/TN1DG/swole/issues/28) | Animated exercise demos with muscle highlighting | `needs-info` |
| [#29](https://github.com/TN1DG/swole/issues/29) | Update Convex from 1.42.1 to the latest patch | closed 2026-08-14, now 1.44.0 |
| [#30](https://github.com/TN1DG/swole/issues/30) | Frontend component tests for the highest-risk flows | `ready-for-agent` |
| [#31](https://github.com/TN1DG/swole/issues/31) | Enable `noUncheckedIndexedAccess` (23 errors) | closed 2026-08-14 |

**On `npm audit`** (closed 2026-08-14, kept here because the count will grow
again): four of those five highs were `devDependencies` — `vite` and
`vite-plugin-pwa` build tooling, nothing served to a browser. Only
`react-router-dom` ships, and its advisory is RSC-mode-only, which this SPA
does not use. A raw high count is not a count of live risks; check the
dependency path with `npm ls <pkg> --all` before reacting. Per-advisory
reasoning is in `docs/project-review-2026-08-13.md` §3.3.

Not an issue, because it is a runbook rather than a decision: **turning Turnstile
on in production**. Site key is set and verified in the production bundle; only
the Convex secret remains. See `docs/security-audit.md` → "Turning Turnstile on
in production", and follow the order exactly.

---

## Known behaviours — decide, don't "fix" blindly

**Deliberately not issues.** Each of these looks like a bug and isn't, or is a
trade that was made on purpose. Filing them as work invites someone to "fix"
something that would be worse afterwards. Read the reasoning before changing any
of them.

1. **Imperial height rounds to whole inches.** 176cm → 5'9" → back to 175cm; up
   to ~1.3cm drift, and saving while in imperial stores the rounded value
   (~5 kcal of TDEE). Avoiding it means tracking whether the ft/in fields were
   actually edited and preserving the original cm if not — the same shape as
   [#22](https://github.com/TN1DG/swole/issues/22).
2. **Daily lifting goal stays kg** even in imperial — it's a lifted *volume*,
   not a bodyweight, and its 1–50000 validation range is defined in kg.
3. **A challenge is one thread entry, not an event log.** Shows current status,
   positioned at `resolvedAt ?? startedAt ?? createdAt`. Per-transition history
   would need a new append-only table.
4. **Account deletion leaves the friend's `threadReads` row** pointing at the
   departed user. Harmless timestamp; finding them would need an index that
   exists for nothing else.
5. **Avatar `contentType` check tolerates a missing type.** Client-asserted and
   therefore not a security boundary; `size` is the real guard. See
   `convex/profiles.ts:setAvatar` before "tightening" it.
6. **Comment authors on a public post are visible to strangers** (the composer
   says so), and reports have no moderator UI — they're read from the Convex
   dashboard, like `featureRequests`.
7. **Outgoing friend requests deliberately show no avatar.** Incoming ones do.
   Usernames are resolvable by anyone via `resolveUsername`, so returning an
   avatar on outgoing requests would let anyone harvest any user's photo by
   looking them up and sending a request the target never accepts. See the
   comment on `myOutgoingRequests` in `convex/friends.ts`. Still the right call
   after [#24](https://github.com/TN1DG/swole/issues/24) closed: lookup is now
   rate limited, not prevented, so the harvest is slower rather than blocked.
8. **Changing a Convex function's *kind* breaks already-loaded clients**, and
   that was accepted knowingly for
   [#24](https://github.com/TN1DG/swole/issues/24). `resolveUsername` went from
   `query` to `mutation`, so a client running a cached bundle calls it the old
   way and gets `Trying to execute friends.js:resolveUsername as Query, but it
   is defined as Mutation` — which the ErrorBoundary turns into a **full-app
   crash screen**, not a broken search box. Observed on staging 2026-08-14,
   with the page on `index-CYB9Q-vW.js` while the network served
   `index-OvW8ypDw.js`.

   `registerType: 'autoUpdate'` (`vite.config.ts`) activates the new worker on
   the *next* visit, so the exposure is one session per user: they must reload
   before the new code runs. "Reload App" on the crash screen fixes it. Accepted
   because this is a personal project with no user base to protect.

   **The general lesson, for next time:** renaming or retyping a public Convex
   function is a breaking API change, and a precaching PWA guarantees old
   clients exist for a window after every deploy. The non-breaking shape is
   additive — leave the old export answering harmlessly, add the new one beside
   it, delete the old one a release later. Same family as
   [#19](https://github.com/TN1DG/swole/issues/19), which closed by *detecting*
   the disagreement and telling the user to refresh. The same trick is not
   available here: a stale bundle calling a now-mutation gets a transport-level
   error inside `useQuery`, which the ErrorBoundary catches before any code of
   ours can interpret it.

   **The unfixed root cause is still open**: `registerType: 'autoUpdate'`
   activates a new worker on the *next* navigation, so a stale shell always
   exists for one session after a deploy. `clientsClaim` + `skipWaiting` in
   `vite.config.ts` would close the whole class, at the cost of swapping assets
   under a running app. #19 called that out as deserving its own decision, and
   it still does — it is the single change that would have prevented both of
   these.
9. **Bundle is ~229KB gzipped**, with a >500KB chunk warning. Code splitting was
   deliberately skipped: the weight is MUI + Convex client + React, needed by
   every route, and this is a PWA that precaches the whole bundle. Revisit only
   if initial load becomes a *measured* problem.
10. **Preview `--preview-run` logs no output on reuse builds**, where a fresh
    deployment logs `"Seeded 70 exercises."`. Seeded state is correct either way;
    the first-deploy path is the one that matters for a new branch. Look here if a
    new branch ever comes up with an empty exercise library.
11. **The signup throttle is global, not per-IP.** `rateLimiter.signUp` is 20 per
    10 minutes app-wide, because a Convex action cannot see the caller's IP. That
    stops scripted floods but not a slow distributed trickle. The real fix —
    Cloudflare Turnstile — is built and verified; see the runbook above.

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
- **`tsc -b` alone does not typecheck `convex/*.test.ts`.** Root typecheck,
  vitest and lint were once all green while `npx convex dev` failed with five
  type errors. `npm run typecheck` runs both projects for this reason; CI runs
  the same script.
- **A migration can only run where it's deployed.** `--prod` once failed with
  "Could not find function" until the promotion reached `main`, because
  production runs `main`'s code. `npm run deploy:emergency` would have "worked",
  by pushing all of `dev` to production and bypassing both gates. Don't.
- **Removing a table from `convex/schema.ts` does not remove its rows.** They
  stop being validated and stop being visible to typed queries, but they persist.
  Reaching them again needs a cast, because the generated `DataModel` no longer
  declares the table.
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
- **A header-only change cannot reach an installed PWA**, and neither can a new
  bundle, immediately. The service worker precaches `index.html`, so a navigation
  served from the Cache API carries the headers *and the asset references* it was
  cached with. `vite.config.ts` mirrors the CSP into a build-only
  `<meta http-equiv>` tag (`cspMetaTag`) so the policy travels with the shell it
  applies to; `vercel.json` stays the source of truth and `vercel-headers.test.ts`
  pins both copies. Observed 2026-08-13: after a production deploy, the **first**
  navigation still served the previous bundle and the second picked up the new
  one. That one-visit lag is what [#19](https://github.com/TN1DG/swole/issues/19)
  is about.
- Anything loaded from a new origin — fonts, analytics, remote images — needs a
  CSP entry, a rebuilt `index.html`, *and* a check that the live `curl -sI`
  response actually carries it.
- **Chasing a flaky test? Check durations before hunting for a race.** The one
  flake this project has had was a *timeout*, not a logic bug — 21 real password
  hashes against vitest's 5000ms default, measured at 3993–4848ms. Brute
  repetition never reproduced it across 26 runs, including shuffled. What found
  it in a single run was `npx vitest run --reporter=verbose` sorted by duration.
  It now carries an explicit `{ timeout: 30_000 }`; the global default stays 5s
  deliberately, because that is what catches a genuinely hung test.

---

*Items completed before 2026-08-13 lived in this file as struck-through entries.
They are in git history — `git log --follow docs/backlog.md` — and the reusable
lessons from them have been folded into the gotchas above.*

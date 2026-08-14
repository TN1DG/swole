# Project review — 2026-08-13

A pass over the whole project rather than the code alone: repository and branch
strategy, the development environment, CI/CD, system architecture, and production
readiness. Companion to `docs/security-audit.md` (which went deep on `convex/`
specifically) and `docs/backlog.md` (the running what's-left list). This file is
the *how the project is set up* view.

Context for the recommendations: the app is live with real users, built solo, and
the stated direction is **automated / agent-driven development**. That last point
changes the weighting throughout — several things that are merely untidy for a
careful human are load-bearing for an agent.

---

## Verified baseline

Everything below was run, not assumed, on `dev` @ `77a52e7`:

| Check | Result |
| --- | --- |
| `npx vitest run` | **333 passed**, 23 files, 16.1s |
| `npm run typecheck` | clean (both `tsc -b` and `tsc --noEmit -p convex`) |
| `npm run lint` | zero warnings |
| `npm run build` | succeeds; 779 KiB precached, the known >500 kB chunk warning |
| `git status` | clean |
| Node / npm | v22.21.0 / 10.9.4 |

**The codebase is in good shape.** The backend test suite is genuinely strong, the
docs record *why* decisions were made rather than just what changed, and the
security audit from 2026-08-04 closed its own highest-severity findings. Nothing
in this review is a rescue.

What has *not* kept pace is the **process around the code**. Every finding below
is some version of that.

---

## 1. Branch strategy — the answer is "one too many, and it's the wrong one"

### What exists

| Branch | State on 2026-08-13 | Verdict |
| --- | --- | --- |
| `origin/main` | production, serves `swole.day` | keep |
| `origin/staging` | serves `staging.swole.day`, own persistent Convex preview | **keep — it earns its place** |
| `origin/dev` | integration branch, where work lands | keep |
| `origin/feature/workout-feedback-immersive-ui` | **0 commits ahead of `dev`, 35 behind**; last commit 2026-08-03 | **delete — fully merged** |
| local `main` | was 42 commits behind `origin/main` | **fixed** — fast-forwarded |

### Three tiers is not too many, and there's evidence rather than taste

The instinct that `dev → staging → main` is heavy for a solo developer is
reasonable, but this project has already paid for the middle tier twice, and both
occasions are on the record:

- **`docs/backlog.md`** notes that `migrations:dropOrphanedEmailSendAttempts`
  failed against production with "Could not find function" until the promotion
  reached `main`, *because production runs `main`'s code*. A migration can only
  run where it's deployed. Staging is where you find that out cheaply.
- **`scripts/vercel-build.js`** deliberately uses `--preview-name` rather than
  `--preview-create`, so staging carries **persistent** data across pushes. That
  makes it a genuine rehearsal: a schema change that can't cope with existing rows
  fails on staging instead of in production. A clean-slate preview would sail
  through and tell you nothing.

That second property is the real argument. Most three-tier setups for a solo dev
*are* ceremony. This one buys a specific, demonstrated thing.

### But the tiers only pay off if the gates check something — and they didn't

This is the finding that matters most in the whole review, so it gets its own
section below.

### Actions taken

- Local `main` fast-forwarded to `origin/main` (`0 0` divergence, verified).
- Empty stray `srctheme/` directory at the repo root removed — untracked, empty,
  almost certainly a Windows path-typo artifact of `src\theme`.

### Action left for you

The merged feature branch deletion was blocked by the local permission classifier
and needs one command from you. Merge status re-confirmed immediately beforehand
(`git rev-list --left-right --count origin/dev...origin/feature/workout-feedback-immersive-ui`
→ `35  0`, i.e. nothing on the branch is absent from `dev`):

```bash
git push origin --delete feature/workout-feedback-immersive-ui
```

### Ongoing hygiene — and a recommendation this review got wrong

The original version of this section recommended enabling **"Automatically delete
head branches"** (Settings → General), on the reasoning that it's what stops
merged branches lingering, and that it matters more once agents are opening them.

**That advice was wrong for this repo, and it cost the `dev` branch.** It was
enabled, and merging PR #15 (`dev → staging`) deleted `dev` — because in a
promotion flow the *head* of every PR is a **permanent** branch, not a disposable
feature branch. Left on, merging PR #16 (`staging → main`) would have deleted
`staging` next.

Recovery was trivial because nothing was lost: `dev`'s tip was already fully
merged into `staging`, so `git push origin dev:dev` from the local clone restored
it exactly. The setting is now **off**, which is the correct state for this
workflow.

The general principle still holds — merged feature branches shouldn't accumulate.
But it has to be applied by hand here (`git push origin --delete <branch>` after
merging a genuine feature branch), because GitHub's setting cannot distinguish a
throwaway head from a permanent one. **If agents start opening feature branches,
delete them explicitly as part of the merge step rather than reaching for this
setting.**

---

## 2. There was no CI at all — the keystone finding

`gh api repos/TN1DG/swole/actions/workflows` returned `{"total_count": 0}`. Nothing
ran typecheck, lint, tests, or the build on any push or pull request. Every quality
gate in this project was **manual and advisory**.

Worse, the controls were believed to be stronger than they were:

> `CLAUDE.md`: "`main` is protected (no direct pushes)"

**It is not.** Both `gh api repos/TN1DG/swole/branches/main/protection` and
`.../rulesets` return:

```
403 — Upgrade to GitHub Pro or make this repository public to enable this feature.
```

On a **private** repo, branch protection and rulesets are paid features. So today
nothing mechanically prevents a direct push to `main`, and nothing prevents merging
a PR with failing tests — because no tests ran. The three-tier flow is a convention
honoured by one careful person.

That is survivable for you. It is **not** survivable for an autonomous agent, which
is precisely the direction this project is heading. An agent has no instinct to run
`npm run typecheck` before pushing; it has whatever the repository enforces.

### Fixed

`.github/workflows/ci.yml` now runs on push and pull request to `dev`, `staging`,
and `main`: `npm ci`, then the four commands `docs/backlog.md` already named as the
verify routine — `npm run typecheck`, `npm run lint`, `npx vitest run`,
`npm run build`.

Three details specific to this repo, each recorded in the workflow's comments so
nobody "simplifies" them away:

- **`npm run typecheck` must run both halves.** `tsc -b` alone does *not*
  typecheck `convex/*.test.ts`. `docs/backlog.md` (gotchas) records an occasion when
  root typecheck, vitest and lint were all green while `npx convex dev` failed with
  five type errors.
- **`timeout-minutes: 20`, not something tight.** `emailAuth.test.ts` has one test
  that creates 21 accounts to trip a limit of 20, each with a real password hash,
  deliberately budgeted 30s (see the flaky-test gotcha in `docs/backlog.md`). A shared GitHub runner is slower than
  a dev machine, and a timeout there would read as a flake rather than the resource
  limit it is.
- **The build step is not redundant.** It is the only check that exercises the
  `vercel.json` → `<meta>` CSP mirror in `vite.config.ts`, which is pinned by
  `vercel-headers.test.ts` but generated at build time.

### Resolved same day — the repo went public and `main` is now protected

A green tick nobody is obliged to look at is documentation, not a gate. Turning it
into enforcement needed branch protection, which on a private repo is a paid
feature. **The repository was made public on 2026-08-13**, which makes protection
and unlimited Actions minutes free.

Before relying on that, history was scanned rather than assumed safe — going public
exposes every commit, not just the current tree. Across all 77 commits:

- No `.env*` file was ever committed (`--diff-filter=A` over all refs, empty).
- No file matching `secret`, `credential`, `.pem`, `.key`, or `id_rsa` was ever added.
- No content matching Resend keys (`re_…`), Stripe-style keys, `BEGIN … PRIVATE KEY`,
  Turnstile secrets (`0x4AAA…`), or a production Convex deployment string.
- `.vercel/` is untracked; `project.json` with the org and project ids never landed.

**Protection now applied to `main`:**

| Setting | Value | Why |
| --- | --- | --- |
| Require a pull request | yes, **0 required approvals** | GitHub blocks self-approval, and this is a solo repo — requiring 1 would make every PR unmergeable. |
| Require status checks | **`verify`** | The CI job. This is the control that stops a red build reaching production. |
| Strict (branch up to date) | **off** | Deliberate. `main` gains a merge commit on every promotion that `staging` does not have, so strict mode would demand `staging` be updated before *every* merge — constant friction for no safety gain in a linear promotion flow. |
| Force pushes / deletions | blocked | — |
| Conversation resolution | required | — |
| Enforce on admins | **off** | An emergency escape hatch, since a CI outage unrelated to the code would otherwise block a hotfix. It is a hatch, not a workflow. |

`staging` is deliberately left unprotected so it stays cheap to iterate on as a
rehearsal surface. Revisit when agents start owning the `dev → staging` hop.

**One consequence of going public to keep in view:** this document and
`docs/security-audit.md` are now world-readable, and they name live weaknesses
precisely — that Turnstile is inert in production, the exact rate-limit numbers,
and (at the time of writing) that `resolveUsername` enumeration was unthrottled.
That disclosure only has teeth while the weaknesses are live, which makes
§3.1/§3.2 more time-sensitive than they were this morning. The chosen answer is
to close the findings rather than redact the writing.

Enumeration was closed on 2026-08-14 (issue #24). Turnstile remains the
outstanding one.

---

## 3. Production readiness

### 3.1 Turnstile is inert in production — confirmed, not inferred

`npx convex env list --prod` returns exactly four variables:

```
JWKS, JWT_PRIVATE_KEY, RESEND_API_KEY, SITE_URL
```

**`TURNSTILE_SECRET_KEY` is absent.** By the deliberate fail-open design documented
in `docs/security-audit.md` (§D) — enforcement is conditional on the secret being
set, so that a fresh preview deployment with zero env vars doesn't break sign-up —
production currently has **no bot protection on sign-up** beyond the app-wide
`rateLimiter.signUp` limit of 20 per 10 minutes.

That design tradeoff was made knowingly and the audit called out its cost: "production
silently loses the protection if the variable ever goes missing". It has never been
set, so the protection has never been on.

This is not urgent — the global limit still stops scripted floods — but the work is
built, tested, and sitting unshipped, which is the worst of both worlds.

### 3.2 Promotion debt — ✅ shipped 2026-08-13

**Resolved the same day.** PR #15 (`dev → staging`) and PR #16 (`staging → main`)
both merged; `staging` and `main` are now identical and production carries the
Turnstile machinery, CI, and the MIT licence. PR #16 was the first merge the
required `verify` check ever gated — it sat at `BLOCKED` until CI reported green.

Merging PR #15 also, incidentally, **fixed the staging widget bug** by producing
the first genuinely new git-triggered build since the site key was added. See
`docs/security-audit.md` for the confirmed diagnosis.

What remains is only the key setup, which is a runbook now rather than an
investigation. The original description follows.

<details><summary>Original finding, 2026-08-13 morning</summary>

The repo has been untouched for nine days (`pushedAt` 2026-08-04):

- **`staging` is ahead of `main`** by the entire Turnstile change set (11 files,
  +559 lines, including the `vercel.json` CSP update and `vercel-headers.test.ts`).
- **`dev` is ahead of `staging`** by one documentation commit.

So there are two promotions outstanding. The correct order, and the trap to avoid,
are both already documented in `docs/security-audit.md`:

1. PR `dev → staging`, then PR `staging → main`.
2. `npx convex env set TURNSTILE_SECRET_KEY <secret> --prod`.
3. Set `VITE_TURNSTILE_SITE_KEY` in Vercel (Production scope).
4. **Force a genuinely new production build — not `vercel redeploy`.** Vite inlines
   `VITE_*` at build time, and the audit's leading theory for the staging widget
   failure is that `redeploy` reuses the *previous* deployment's environment
   snapshot, captured before the variable existed.

One open unknown remains from that session: the widget does not render in the
browser on staging. The audit narrowed it to a single console check that
distinguishes the two candidates (a CSP refusal on
`https://challenges.cloudflare.com` versus the site key being absent from the
bundle). That is a ten-minute job, not an investigation.

**Note the key order above (secret at step 2, site key at step 3) is wrong** and
was corrected once the diagnosis landed: setting the secret before a rebuild that
carries the site key breaks sign-up for every new user. The runbook in
`docs/security-audit.md` has the safe order — site key and rebuild first, secret
last.

</details>

### 3.3 ~~`npm audit` has grown since the last pass~~ — ✅ CLEARED 2026-08-14

Was **5 high**. Now **0**, via plain `npm audit fix`. Every fix was a patch bump
inside an existing semver range, so `package.json` did not change at all — only
`package-lock.json`.

The triage is recorded per advisory below, because "0 vulnerabilities" is a
fact with a short shelf life and the *reachability reasoning* is what survives
the next time these reappear.

| Advisory | Reaches | Verdict |
| --- | --- | --- |
| `brace-expansion` — DoS via unbounded expansion (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895) | build only | `vite-plugin-pwa` → `workbox-build` → `minimatch`, via both `glob` and `ejs`/`jake`/`filelist`. Not in the bundle. Exploiting it means feeding hostile glob patterns to your own build. |
| `fast-uri` — host confusion via backslash (GHSA-7p8r-x3mc-p8w7) | build only | `vite-plugin-pwa` → `workbox-build` → `ajv`. Schema validation during the PWA build. Never sees user input. |
| `nanoid` — infinite loop on size zero (GHSA-2v37-7h3g-55p8) | build only | `vite` → `postcss`. Generates ids while processing CSS at build time. Also needs a *custom* generator called with size 0, which postcss does not do. |
| `react-router` / `react-router-dom` — RSC-mode CSRF (GHSA-qwww-vcr4-c8h2) | ships | Only exploitable in RSC mode. This is a client-only SPA with no server component runtime, so the vulnerable path does not exist here. Patched anyway. |

**The important structural point: four of the five were `devDependencies`.**
`vite` and `vite-plugin-pwa` are build tooling; nothing under them is served to
a browser. Only `react-router-dom` is a production dependency, and it was the
one already assessed as not applicable. So the "5 high" was never 5 live risks
in the deployed app — worth remembering before the next count causes alarm.

**The old "don't run `npm audit fix --force`" warning is now spent** for this
set: `react-router-dom@7.18.2` is a patched release inside `^7.18.1`, so plain
`npm audit fix` took it without a downgrade. The general caution still stands —
`--force` makes semver-major changes and would have moved `react-router` across
a major boundary. Check what it intends to do before running it, every time.

### 3.4 ~~`RESEND_API_KEY` is set on the dev Convex deployment~~ — ✅ REMOVED 2026-08-13

Local development could send real email from the live Resend account.
Deliberately *not* set on previews, per the environments plan — the same reasoning
applied to dev.

Unset on `necessary-rhinoceros-257` (dev). Production verified untouched
immediately afterwards, since the two commands differ only by `--prod`.

**Checked before removing, rather than assumed safe** — and it turns out to
*improve* the dev loop rather than degrade it. Both senders degrade gracefully
instead of throwing:

- `convex/emailAuth.ts:58` logs the code instead of sending it:
  `RESEND_API_KEY not set — <kind> code for <email>: <token>`. So verification
  and password-reset codes now appear in the Convex logs, and testing those
  flows locally no longer needs a real inbox.
- `convex/featureRequests.ts:57` skips the send with a warning; the submission
  still saves. A test pins this (`skips sending (without throwing) when
  RESEND_API_KEY is unset`).

To restore it for a specific test: `npx convex env set RESEND_API_KEY re_...`.

### 3.5 ~~`npm run deploy` is a loaded footgun~~ — ✅ RENAMED 2026-08-13

The script pushes straight to production Convex and `vercel --prod`, bypassing both
PR gates and skipping staging entirely. `docs/backlog.md` already says "Don't" in
prose, which works on a human who has read it and not at all on an agent doing
script-name autocomplete.

**Now `npm run deploy:emergency`.** A name is a stronger signal than a paragraph,
and it no longer sits one tab-completion away from `npm run dev`. References
updated in `README.md`, `CLAUDE.md`, and `docs/backlog.md`.

Note this matters more than it did when the review was written: `main` is now
protected and gated on CI, so the PR flow has real checks to bypass. This script
is the one remaining path around them.

---

## 4. Development environment

### 4.1 The frontend is not typechecked in strict mode — highest-value code finding

`tsconfig.app.json` sets `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch` and `erasableSyntaxOnly`, but has **no `"strict": true`**
and no `extends`. `convex/tsconfig.json` *does* set `strict: true`.

So the backend is strict-checked and the **entire React frontend is not** — no
`strictNullChecks`, no `noImplicitAny`, no `strictFunctionTypes`. In a codebase
whose main selling point is that "types flow end-to-end from the DB schema into
components", most of that safety is discarded at the boundary where it would do the
most good: a Convex query result is `T | undefined` while loading, and without
`strictNullChecks` nothing makes you handle the `undefined`.

**✅ DONE 2026-08-13 — and the predicted fallout was zero.**

This section recommended enabling `strict` in a dedicated PR because it "will
produce a fallout list of unknown size". The size turned out to be **0 errors
across all 75 files**. The code was already written to strict standards; the flag
simply was never set. Plausibly because `convex/` *is* strict and the Convex
generated types flow into the components precisely enough to keep the frontend
honest by accident.

Verified rather than assumed, because a zero-error result is exactly what a
silently-ignored flag also looks like:

- `tsc --showConfig` confirms `"strict": true` in the effective config over 75 files.
- A throwaway probe file compiled against the real config tripped **TS18048**
  (`'s' is possibly 'undefined'`) and **TS7006** (implicit `any`), proving
  `strictNullChecks` and `noImplicitAny` are actually enforcing.

`noImplicitReturns` was also zero-error, so it went in alongside — same category,
same config block, no cost. `tsconfig.node.json` had the identical gap and was
also clean, so both projects now match: a file can't get looser checking just by
living in the build-tooling project.

**Still available, measured but not applied** — these are real work, not free:

| Flag | Errors | Status |
| --- | --- | --- |
| `noUncheckedIndexedAccess` | 23 | ✅ **on, 2026-08-14** ([#31](https://github.com/TN1DG/swole/issues/31)) |
| `exactOptionalPropertyTypes` | 16 | available |
| `noPropertyAccessFromIndexSignature` | 7 | available |

`noUncheckedIndexedAccess` was the one worth doing next — it catches the
`array[i]` -is-actually-possibly-undefined class of bug, which was the most
common remaining unsoundness in an otherwise strict codebase.

**How the 23 were fixed matters more than that they were.** Most became
*provable* rather than asserted: a bounds check that reads the element and
tests it (`convex/workouts.ts`, `RoutineEditor`) instead of comparing indices
to `length`; a non-empty tuple type on `RELEASES` so `CURRENT_RELEASE` is a
`Release` by construction; `.at()` in `ProgressChart`; measuring a glyph from
the character itself in `SwoleCoin` rather than looking it up by a parallel
index. Two sites kept a non-null assertion — `dayCurvePoints`, which clamps its
index on the line above, and the increment/workout pairing in `points.ts` — and
both carry a comment saying why an assertion beats a `?? 0` there: a silent
zero would mis-award points, where a throw would not.

**Tests are excluded from this one flag**, via `convex/tsconfig.test.json`.
Enabling it there produced 155 errors fixable only by 155 non-null assertions.
The flag exists so an out-of-range read cannot become an `undefined` that
travels; in a test it fails on the spot, in the assertion that was going to
catch it anyway. Tests are still fully typechecked — `npm run typecheck` now
runs three projects.

### 4.2 ~~Test coverage is lopsided~~ — first component tests landed 2026-08-14

Was: 21 backend test files against **2** frontend ones, both pure-logic, no
component rendering anywhere and no Testing Library dependency. The imbalance
was fine while every release was hand-QA'd by the person who wrote it, and
stopped being fine the moment an agent started editing components.

Closed as a *start*, not a finish ([#30](https://github.com/TN1DG/swole/issues/30)).
Testing Library + jsdom are wired up, and the two highest-risk files named here
now have behavioural tests: `ActiveWorkout.tsx` (volume totals, warm-up
exclusion, the trophy/slash marks, and that weight *entry* stays kg while
display follows `unitPreference` — pinned deliberately ahead of #22) and
`SignInPage.tsx` (the sign-in failure message and all three branches of the
stale-shell detection from #19).

**Vitest now runs four projects** rather than one global environment, because
they genuinely differ:

| Project | Environment | Files |
| --- | --- | --- |
| `convex` | `edge-runtime` | `convex/**/*.test.ts` — matches convex-test |
| `ui` | `jsdom` | `src/**/*.test.tsx` — renders components |
| `logic` | `node` | `src/**/*.test.ts` — pure functions |
| `root` | `node` | `*.test.ts` — the CSP guard, which reads `vercel.json` |

Two things learned wiring that up, both worth keeping:

- **Explicit `include` globs silently drop files.** The first split lost
  `vercel-headers.test.ts` — it sits at the repo root and matched no project,
  so the suite went quietly from 372 tests to 365 and still reported all green.
  Check the *count*, not the colour, after changing test config.
- **Scope jsdom to the files that need a DOM.** Running the pure-logic `src`
  tests under jsdom too cost ~19s of environment setup for nothing; splitting
  `logic` out cut it to ~7s.

**Honest note on speed:** the suite went from ~9s to ~17s wall time. That is
not nothing, and it is the one acceptance criterion on #30 not fully met — the
cost is importing React and MUI to render real components, which is the point
of the exercise. Worth revisiting (happy-dom, or shallower fixtures) if it
grows again.

### 4.3 The lint ruleset is thin

`.oxlintrc.json` enables the `react`, `typescript` and `oxc` plugins but configures
only two rules explicitly. Oxlint's defaults cover the correctness category, so this
isn't nothing — but it's a long way from what a linter can catch, and lint is the
cheapest possible feedback for generated code. Worth a pass through oxlint's
`correctness` + `suspicious` categories now that CI enforces the result.

### 4.4 Smaller notes

- **No git hooks.** With CI in place a pre-push hook running lint+typecheck would
  shorten the feedback loop, but it's optional and CI is the real gate.
- **`sha_pinning_required` is `false`** on Actions, and `allowed_actions` is `all`.
  Fine for a two-action workflow using first-party `actions/*`. Pin third-party
  actions to SHAs if CI ever handles secrets.
- **npm 10.9.4 → 12.0.2 available.** Cosmetic; CI pins Node 22 to match local.
- ~~**Convex 1.42.1 → 1.42.3+**~~ — **done 2026-08-14** ([#29](https://github.com/TN1DG/swole/issues/29)),
  to **1.44.0** rather than a 1.42.x patch. The declared range was already
  `^1.42.1`, so 1.44.0 was permitted all along and the *lockfile* was simply
  behind the manifest — worth noting, because it means a lockfile-less install
  would have resolved differently from the pinned one. Peers were satisfied
  (`@convex-dev/auth` wants `^1.17.0`, `@convex-dev/rate-limiter` `^1.24.8`),
  `convex/_generated` did not drift, and all four gates passed unchanged.

---

## 5. System architecture — no significant concerns

Reviewed and deliberately reporting a short section rather than manufacturing
findings.

**The structure is sound.** `convex/` holds schema plus all queries and mutations;
`src/features/<feature>/` groups UI by feature with `src/components/` for the
shared shell. 24 tables, 98 endpoints, ~20.5k lines across `src/` and `convex/`.
The separations that matter are real ones:

- `convex/validation.ts` centralises input sanitisation, and knows the things
  people forget (`v.number()` accepts `NaN` and `Infinity`).
- The three identity helpers are properly distinct and documented as such:
  `identity.ts:publicIdentity` (stranger-safe), `friends.ts:profileFor`
  (friends-and-public-opt-in), `profileForWithAvatar` (friends-only). The audit
  correctly identifies "adding a new field to the wrong one" as how the next leak
  happens.
- Rate limits live at each module's auth funnel (`getOwnedWorkout`, the per-file
  `requireUserId` helpers) rather than on individual handlers, so a new mutation
  inherits them by construction instead of by memory.
- Tests sit next to the code they test and are excluded from deployment by the
  Convex CLI's more-than-one-dot rule.

**Watch, don't act:** `convex/feed.ts` at 721 lines is the largest file by ~40%,
followed by `ActiveWorkout.tsx` at 514 and `FriendChatPage.tsx` at 480. All three
are split candidates eventually. None is urgent, and splitting for its own sake
would trade a known layout for an unknown one.

**The PWA/CSP handling is a genuine strength.** `vite.config.ts` mirroring
`vercel.json`'s policy into a build-only `<meta>` tag — because a service worker
precaches `index.html` with the headers it was cached with, so a header-only fix
reaches nobody already installed — is a subtle failure mode that most projects ship
and never diagnose. It is solved, commented, and pinned by a test.

---

## 6. The automation roadmap

The stated goal is agent-driven development. Ordered, with the reasoning:

**1. CI.** Done above. Nothing else is safe without it.

**2. Required status checks.** ✅ **Done 2026-08-13** — the repo went public and
`main` now requires a PR with a green `verify` check. This is what converts CI
from a green tick into a gate, and it was the blocker for everything below it. An
agent that can merge a red build is worse than no agent.

**3. Issues as the work queue.** The scaffolding docs describe a machine with no
parts: `docs/agents/triage-labels.md` specifies five canonical labels and
`docs/agents/issue-tracker.md` builds a whole workflow on them, but `gh label list`
returned **only GitHub's stock defaults**, and the repo has **zero issues**, open or
closed.

   *Fixed in this pass:* `needs-triage`, `needs-info`, `ready-for-agent` and
   `ready-for-human` now exist (`wontfix` already did).

   *Also done 2026-08-13:* `docs/backlog.md`'s numbered items are now **13 open
   issues, [#19–#31](https://github.com/TN1DG/swole/issues)** — 8 `ready-for-agent`,
   4 `ready-for-human`, 1 `needs-info`. #22 is marked blocked by #21 using GitHub's
   native issue dependencies, so a frontier query can skip it.

   Three judgement calls worth recording:

   - **The P4 "known behaviours" were deliberately not migrated.** Each looks like
     a bug and isn't, or is a trade made on purpose. Filing them as work invites
     someone to "fix" something that would be worse afterwards. They stay in
     `backlog.md` under a heading that says so.
   - **The lb/kg item became two issues, not one.** The backlog itself recommended
     splitting display (mechanical, agent-safe) from the `ActiveWorkout` inputs
     (precision policy, a human call). One issue would have been un-claimable.
   - **`backlog.md` was rewritten, not deleted.** It keeps what isn't issue-shaped:
     current state, the deliberate behaviours, and the gotchas. Reusable lessons
     from the old struck-through DONE entries were folded into the gotchas rather
     than lost to git history.

**4. Scoped agent sessions.** Once 2 and 3 exist: a `/schedule` routine that picks
up `ready-for-agent` issues, works on `dev`, and opens a PR. CI gates it; you review.
Start with the mechanical items — the lb/kg **display** layer (#21) is
close to ideal: well-specified, tests already pin the behaviour, and the backlog
even records the trap (don't regex-sweep it; a lazy `[\s\S]*?` once broke 60 tests).

**5. Keep the human at `staging → main`.** Let automation own `dev`, and eventually
`dev → staging`. Production promotion stays a person's decision. The three-tier
branch structure turns out to be *exactly* the right shape for this: it already has
a natural boundary between "machines may operate here" and "a human decides".

That last point is the real answer to the branching question. You do not have too
many branches for a solo developer. You have close to the right number for a solo
developer **who is about to add agents**.

---

## Changes made in this pass

| Change | File / action |
| --- | --- |
| Added CI: typecheck, lint, test, build on push + PR to all three branches | `.github/workflows/ci.yml` (new) |
| Created the four missing triage labels | `gh label create` ×4 |
| Fast-forwarded local `main` (was 42 behind) | git |
| Removed the empty stray `srctheme/` directory | filesystem |
| Corrected four stale README claims: live URL, styling stack, table count, test count | `README.md` |
| Documented the branch flow, per-branch environments, and verify routine in the README | `README.md` |
| Renamed `npm run deploy` → `deploy:emergency` and documented what it bypasses | `package.json`, `README.md`, `CLAUDE.md`, `docs/backlog.md` |
| Made the repo public; protected `main` with `verify` as a required check | GitHub settings |
| Disabled "auto-delete head branches" after it deleted `dev`; restored the branch | GitHub settings, git |
| MIT licence | `LICENSE` (new), `README.md` |
| Enabled `strict` + `noImplicitReturns` on both TS projects (zero fallout) | `tsconfig.app.json`, `tsconfig.node.json` |
| Diagnosed and closed the Turnstile widget bug; added the enablement runbook | `docs/security-audit.md` |
| Removed `RESEND_API_KEY` from the dev Convex deployment | `convex env remove` |
| Filed the first repo issue, for the stale-shell Turnstile dead end | GitHub issue #19 |
| This document | `docs/project-review-2026-08-13.md` (new) |

The stale README claims, for the record, were: live app at `swole-six.vercel.app`
(now `swole.day`), "Tailwind CSS v4" as the styling layer (**not a dependency** —
it is MUI v9 + Emotion; only stale comments still mention Tailwind), "13 tables"
(24), and "92 tests, ~2s" (333 tests, 23 files, ~16s).

## Open items, in recommended order

1. ~~Delete the merged branch~~ — **done 2026-08-13** (§1)
2. ~~Decide branch protection~~ — **done 2026-08-13**: repo made public, `main`
   protected with `verify` as a required check (§2)
3. ~~Ship the promotion debt~~ — **done 2026-08-13**, PRs #15 and #16 merged.
   ~~Diagnose the staging widget~~ — **done**, it renders; the redeploy theory was
   confirmed. **Still to do: turn Turnstile on in production** — a runbook now,
   not an investigation. See "Turning Turnstile on in production" in
   `docs/security-audit.md`, and follow the order exactly (§3.1)
4. ~~Enable `strict` in `tsconfig.app.json`~~ — **done 2026-08-13**, zero
   fallout; `noImplicitReturns` and `tsconfig.node.json` came along free.
   Follow-up ~~`noUncheckedIndexedAccess` (23 errors)~~ — **done 2026-08-14**
   ([#31](https://github.com/TN1DG/swole/issues/31)), tests excluded from that
   one flag on purpose (§4.1)
5. ~~Re-triage the 5 `npm audit` highs~~ — **done 2026-08-14**, now 0; four of
   the five were build-only `devDependencies` (§3.3)
6. ~~Rename `npm run deploy` → `deploy:emergency`~~ — **done 2026-08-13** (§3.5)
7. ~~Migrate `docs/backlog.md` items into GitHub issues~~ — **done 2026-08-13**:
   13 open issues, [#19–#31](https://github.com/TN1DG/swole/issues). `backlog.md`
   is now the narrative index, not a second queue (§6.3)
8. ~~Remove `RESEND_API_KEY` from the dev Convex deployment~~ — **done
   2026-08-13**; codes now log to the Convex console in dev (§3.4)
9. Frontend component tests, starting with `ActiveWorkout.tsx` (§4.2)

Two items are now newly relevant because the repo is public:

10. ~~**Add a LICENSE.**~~ — **done 2026-08-13.** MIT, © Oluwatobi Tella Ndanusa.
    Chosen over AGPL deliberately: AGPL would have protected `swole.day` from a
    hosted clone, but the point of publishing is that people can read and reuse
    the code. Note GitHub's licence detection reads the **default branch**, so the
    repo sidebar keeps showing no licence until `LICENSE` reaches `main` with the
    next promotion.
11. **Fork PRs are now possible.** `ci.yml` is safe as written — it declares
    `permissions: contents: read`, uses no secrets, and `pull_request` (not
    `pull_request_target`) gives a fork's workflow a read-only token. Keep it that
    way: adding a secret to this workflow would expose it to anyone who forks.

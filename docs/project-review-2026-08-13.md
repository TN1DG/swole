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

### Ongoing hygiene

Enable **automatic branch deletion on merge** in the repo settings
(Settings → General → "Automatically delete head branches"). It is the reason this
one lingered for ten days, and it will matter far more once agents are opening
branches.

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
  typecheck `convex/*.test.ts`. `docs/backlog.md` item 18 records an occasion when
  root typecheck, vitest and lint were all green while `npx convex dev` failed with
  five type errors.
- **`timeout-minutes: 20`, not something tight.** `emailAuth.test.ts` has one test
  that creates 21 accounts to trip a limit of 20, each with a real password hash,
  deliberately budgeted 30s (backlog item 22). A shared GitHub runner is slower than
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
and that `resolveUsername` enumeration is unthrottled. That disclosure only has
teeth while the weaknesses are live, which makes §3.1/§3.2 more time-sensitive
than they were this morning. The chosen answer is to close the findings rather
than redact the writing.

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

### 3.2 Promotion debt: work is finished and not shipped

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

### 3.3 `npm audit` has grown since the last pass

**5 high**, across `brace-expansion`, `fast-uri`, `nanoid`, `react-router`,
`react-router-dom`. `docs/backlog.md` item 14 records 4 high from one root cause on
2026-08-04, and separately notes the `brace-expansion` chain had "resolved
upstream" — it is back, and `fast-uri` and `nanoid` are new and unassessed.

The standing analysis of `react-router` still holds: the advisory is RSC-mode CSRF,
this is a client-only SPA, and `npm audit fix --force` would downgrade it. **Don't.**
But the other three deserve a fresh triage rather than inheriting that verdict.

### 3.4 `RESEND_API_KEY` is set on the dev Convex deployment

Local development can therefore send real email from the live Resend account.
Deliberately *not* set on previews, per the environments plan — the same reasoning
applies to dev. Low severity, easy to remove.

### 3.5 `npm run deploy` is a loaded footgun

The script pushes straight to production Convex and `vercel --prod`, bypassing both
PR gates and skipping staging entirely. `docs/backlog.md` already says "Don't" in
prose, which works on a human who has read it and not at all on an agent doing
script-name autocomplete.

**Recommendation:** rename it `deploy:emergency`. The README now documents it inside
a collapsed "bypasses both PR gates, emergencies only" block, but a name is a
stronger signal than a paragraph.

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

**Recommendation: enable `strict` in its own dedicated PR.** It will produce a
fallout list of unknown size, which is exactly why it must not ride along with
other work. This is the single highest-value change available after CI.

### 4.2 Test coverage is lopsided

21 backend test files against **2** frontend ones (`releaseNotes.test.ts`,
`restPresets.test.ts`), and both of those are pure-logic — no component renders
anywhere in the suite. There is no Testing Library dependency.

The backend suite is excellent and the imbalance has been fine while every release
is manually QA'd on staging by the person who wrote it. It stops being fine the
moment an agent edits a component: nothing would catch it. The highest-risk targets
are `ActiveWorkout.tsx` (514 lines, the app's core interaction, and the file the
backlog flags as riskiest for the lb/kg work) and `SignInPage.tsx` (290 lines, the
flow that has already shipped a misleading-error bug).

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
- **Convex 1.42.1 → 1.42.3+** still outstanding from backlog item 19.

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

   *Still to do:* migrate `docs/backlog.md`'s numbered items into GitHub issues.
   A prose file is excellent for a human picking up context and useless as an agent
   work queue — there is nothing to claim, assign, or close. The backlog's P2–P7
   items are already written as discrete units with a location and a fix; they need
   to become addressable. Keep `backlog.md` as the narrative index, with issues as
   the queue.

**4. Scoped agent sessions.** Once 2 and 3 exist: a `/schedule` routine that picks
up `ready-for-agent` issues, works on `dev`, and opens a PR. CI gates it; you review.
Start with the mechanical items — the lb/kg **display** layer (backlog item 3) is
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
| Moved `npm run deploy` into a collapsed "emergencies only" block | `README.md` |
| This document | `docs/project-review-2026-08-13.md` (new) |

The stale README claims, for the record, were: live app at `swole-six.vercel.app`
(now `swole.day`), "Tailwind CSS v4" as the styling layer (**not a dependency** —
it is MUI v9 + Emotion; only stale comments still mention Tailwind), "13 tables"
(24), and "92 tests, ~2s" (333 tests, 23 files, ~16s).

## Open items, in recommended order

1. ~~Delete the merged branch~~ — **done 2026-08-13** (§1)
2. ~~Decide branch protection~~ — **done 2026-08-13**: repo made public, `main`
   protected with `verify` as a required check (§2)
3. **Ship the promotion debt and turn Turnstile on in production** (§3.1, §3.2)
   — now the top item, and more time-sensitive since the docs went public
4. Enable `strict` in `tsconfig.app.json`, own PR (§4.1)
5. Re-triage the 5 `npm audit` highs (§3.3)
6. Rename `npm run deploy` → `deploy:emergency` (§3.5)
7. Migrate `docs/backlog.md` items into GitHub issues (§6.3)
8. Remove `RESEND_API_KEY` from the dev Convex deployment (§3.4)
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

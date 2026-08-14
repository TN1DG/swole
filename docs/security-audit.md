# Security & scaling audit — 2026-08-04

Full pass over `convex/` (10,755 lines, 98 endpoints) ahead of the app going
more public. Scope: authorization on every endpoint, rate-limit coverage,
input validation, data exposure, and the query patterns that decide whether
this survives more users.

**Headline: the app was in good shape.** Authorization was already correct
everywhere, validation is genuinely strong, and there were no injection or XSS
vectors. What was missing was protection against an *authenticated* abuser —
the existing limits were built for social spam, not resource exhaustion — plus
one real PII leak and two queries that would fail outright at scale.

---

## What was checked, and what passed

**Authorization — all 90 public endpoints. PASS.**
Every one requires auth. Ownership chains are correct: `sets` →
`workoutExercises` → `workouts` → `ownerId`, so you cannot reach another
user's set by guessing an id. Ten `workouts.ts` mutations initially looked
unguarded to an automated scan; they funnel through `getOwnedWorkout`, which
throws. Verified by reading, not by the scan.

**Input validation. PASS, and better than most.** `convex/validation.ts` knows
that `v.number()` accepts `NaN`, `Infinity` and `1e308`, and rejects them
explicitly. Every user-owned table has a growth ceiling — except workouts,
which is fixed below.

**Injection / XSS. PASS.** No `dangerouslySetInnerHTML`, no `innerHTML`, no
`eval`, no `new Function`. No `target="_blank"` missing `rel="noopener"`.
Convex's query builder is not string-concatenated, so there is no SQL-injection
analogue.

**File uploads. PASS.** `setAvatar` checks size and content type server-side,
and upload-URL minting is rate limited — the URL is the licence to write a blob,
so that is the right place to limit.

**Scoring integrity. PASS.** Points are awarded per distinct training day via
`points.ts:reconcileWeek`, so `start`/`finish` in a loop cannot farm points.

---

## Fixed in this pass

### 1. Email addresses published as display names — PII leak (high)

`friends.ts:identityOf` fell back to `user.email` when a profile had no display
name. Its comment claimed every caller had "already established friendship or a
public opt-in". Both remaining callers are stranger-facing:

- `resolveUsername` — any signed-in user can look up any username. It was
  unthrottled at the time of this audit; it is now rate limited per caller
  (see section C), which slows enumeration but does not stop lookup.
- `myOutgoingRequests` — people who never accepted anything.

Reachable: `displayName` is optional in the schema, and `setUsername` is its own
public mutation that doesn't set one. So an account with a username and no
display name had its email readable by anyone who could guess or enumerate the
username. Combined with unthrottled `resolveUsername`, that is an email
harvesting vector.

**Two existing tests asserted the leak as correct behaviour**, including one
called *"a public opt-in makes it visible to anyone"* that checked a stranger
received `alice@test.local`. Fixed to fall back to username, then a neutral
placeholder. Dropping the now-pointless `users` read also removes a database
round-trip per friend from the leaderboard and friends list.

### 2. Rate limiting: 14/59 public writes → 59/59

The existing limits are well designed but scoped to *social* spam — the header
comment in `rateLimiter.ts` says as much: "spam that lands... another user
sees". Nothing stopped an authenticated client hammering its own self-scoped
writes. Nobody else sees those, but they cost function calls and storage, which
is the cheapest way for one account to degrade a public app.

Added `userWrite`, a per-user token bucket charged via `requireWriter`. Sized
from real use: `updateSet` fires on blur, not per keystroke, so a brisk logging
session is ~20–30 writes/minute. **120/min sustained, 60 burst** — 4–6x headroom
for a human, refuses a script. Tests prove all three properties: realistic use
passes, floods are refused, and it is per-user so one abuser cannot lock others
out.

### 3. Workouts could grow without bound

Every other user-owned table had a ceiling; workouts had none, so `start`/
`finish` in a loop grew the database indefinitely. Added
`LIMITS.workoutsPerUser` (20000 — ~27 years at two sessions a day), enforced via
a counter on the profile rather than `COUNT(*)`, since the check runs on every
start. Never decremented: refunding on delete would restore an unlimited
create/delete cycle.

### 4. `exerciseHistory` read every workout ever logged

It collected the entire `by_owner` index and *then* sliced to 200. The cap
applied to the fan-out but not the initial read, so the comment claiming a
"capped scan" was half true. A heavy account would eventually trip Convex's
per-transaction read limit and the query would fail outright. Now takes the cap
directly off `by_owner_startedAt`.

---

## Still open, in priority order

### ~~A. `deleteAccount` will fail for a heavy account~~ — FIXED 2026-08-04
Split into a synchronous half that revokes every credential (and drops the
profile and avatar blob) and a scheduled `purgeAccountData` that deletes the
bulk in ~400-document batches, rescheduling itself until done. The account is
unusable the instant the first half commits; the rest drains behind it.

Two bugs the tests caught during the rewrite, both created by the split itself:

- **The purge wasn't idempotent.** Convex can retry a scheduled function, and
  `ctx.db.delete` on an already-deleted document throws — so a duplicate run
  turned into a permanently failing job. The final `users` delete is now
  guarded.
- **Refunds could resurrect a deleted user.** Two purges can now interleave,
  where one transaction could not. Refunding a challenge to a "survivor" who is
  themselves mid-deletion goes through `awardPoints` → `getOrCreateProfile`,
  which *inserts* a profile row pointing at a user document being torn down —
  recreating exactly the orphan this cleanup exists to prevent. Refunds now
  check the survivor still exists.

Also found while wiring it up: **`deleteAccount` was never actually rate
limited.** The audit's first pass counted it as limited because the file
*mentioned* `rateLimiter` — that was the `otpSend` reset. Good enough to fool a
grep, not an attacker. It now has its own limit.

### ~~B. `profiles.getMine` collects a user's whole workout history~~ — FIXED 2026-08-04
Opening your own profile got more expensive with every workout you had ever
logged. Now reads a 52-week window off `by_owner_startedAt`, which is all the
streak and the week/month point totals ever needed.

The lifetime "workouts completed" stat was the one thing that genuinely
required every row, so it moved to a counter (`profiles.workoutsCompleted`)
maintained by `workouts.finish` and `history.deleteWorkout`. Unlike
`workoutsStarted`, this one *does* decrement — it's a user-facing number, not
an abuse ration.

**`migrations:backfillWorkoutCounts` — RUN ON PRODUCTION 2026-08-04.** Result:
`{ profiles: 15, patched: 15 }`, and a second run returned `patched: 0`,
confirming idempotency. Also run on dev and on the staging preview, idempotent
both times.

Note "15 of 15" does not mean fifteen users had workouts — a profile with none
is still patched, because `undefined` → `0` is a change. What was verified
directly: the migration completed, is idempotent, and production serves 200 with
its CSP intact. What was *not* verified from the CLI is the per-profile value,
which would have needed a read function deployed to production out-of-band;
the logic is covered by tests and was exercised end-to-end on staging first.

Without this backfill, every established user's profile reads 0 workouts, which
looks like data loss.

A test pins the case the counter exists for: a workout from 500 days ago is
outside the read window but still counts toward the lifetime total, while the
streak correctly ignores it.

### ~~C. `resolveUsername` enumeration is still unthrottled~~ — FIXED 2026-08-14
Closed by issue #24. It is now a `mutation` consuming a `usernameLookup` token
bucket (20/minute, burst 10, keyed by caller), which is the only way to
throttle it: the limiter writes, and a Convex query cannot write.

The cost is reactivity at that one call site — `FriendsPage` holds the result
in component state instead of subscribing. Almost free in practice, because the
search box already only ran on submit.

The limit is deliberately per-user rather than global. A shared bucket would
let one script lock every other user out of adding friends, turning an
enumeration guard into a denial of service; a test pins that isolation.

Note this does not make enumeration *impossible*, only slow — 20/minute against
a namespace is a crawl. That is the appropriate ceiling given severity: since
the email leak was closed, a hit reveals only that a username exists.

### ~~D. Signup throttle is global, not per-IP~~ — LIVE IN PRODUCTION 2026-08-14
Cloudflare Turnstile guards sign-up (`convex/turnstile.ts`,
`src/components/TurnstileWidget.tsx`). Both keys are now set on production: the
site key shipped in the PR #18 build, and `TURNSTILE_SECRET_KEY` was set on the
production Convex deployment on 2026-08-14.

**Not yet confirmed by an actual sign-up.** Enforcement fails open by design
(see below), so a wrong secret is indistinguishable from a working one until
someone creates an account and sees the widget render first.

Why it needed two pieces: verifying a token means calling Cloudflare, and only
a Convex *action* can `fetch`, while the hook that must reject an unverified
sign-up (`callbacks.afterUserCreatedOrUpdated`) runs in a *mutation*. So the
action verifies and records a short-lived, single-use pass keyed by email, and
the mutation spends it. The spend happens **before** the `signUp` rate limit is
consumed, so an unverified request can't eat from the app-wide bucket — which
was the denial-of-service in the first place.

**To turn it on** (both are required; either alone leaves it off):

```
# 1. Cloudflare dashboard -> Turnstile -> add a site for swole.day.
# 2. Secret key, on the Convex production deployment:
npx convex env set TURNSTILE_SECRET_KEY <secret> --prod
# 3. Site key, in Vercel project settings as VITE_TURNSTILE_SITE_KEY
#    (Production scope), then REDEPLOY - Vite inlines VITE_* at build time,
#    so setting it without a rebuild changes nothing.
```

Verify afterwards with `npx convex env get TURNSTILE_SECRET_KEY --prod`.

**Deliberate design: enforcement is conditional on the secret being set.**
Preview deployments start with zero environment variables, and hard-requiring
the key would break sign-up on every new branch — a failure this project has
already shipped once. The cost is that production silently loses the protection
if the variable ever goes missing, which is why the check above matters.

### Where Turnstile stands — paused 2026-08-04, pick up here

**Server side is proven working on staging.** Driven end to end via
`npx convex run ... --preview-name staging`:

| Check | Setup | Result |
| --- | --- | --- |
| Token verification rejects | valid token + *failing* test secret | ✅ "Challenge failed" |
| Sign-up blocked | no challenge at all | ✅ "Please complete the challenge" |
| Token verification accepts | valid token + *passing* test secret | ✅ pass recorded |
| Sign-up allowed | with the pass | ✅ tokens issued |
| Pass is single-use | second sign-up, no new pass | ✅ blocked |

The first row is the one that matters: the widget produced a valid token and the
**server** still refused it, so enforcement is server-side, not browser-side.

**Current staging config** (production untouched):
- Convex `TURNSTILE_SECRET_KEY` = `1x0000000000000000000000000000000AA` (test
  secret, always passes) on preview deployment `vivid-vulture-847`
- Vercel `VITE_TURNSTILE_SITE_KEY` = `1x00000000000000000000AA`, scoped to
  Preview (staging branch)

### ~~OPEN: the widget does not render on staging~~ — RESOLVED 2026-08-13

**The widget renders.** Confirmed in a browser on `staging.swole.day`: the
Cloudflare challenge appears on the sign-up form with the red "For testing only.
If seen, report to site owner" banner that marks the test site key.

The redeploy theory was right, and is now confirmed by elimination rather than
inference. Four checks against the live staging page:

| Check | Result |
| --- | --- |
| Widget visible on sign-up | ✅ renders |
| Console CSP refusals on `challenges.cloudflare.com` | **none** |
| `window.turnstile` | `object` — the script loaded |
| Site key inlined in the deployed bundle | ✅ present |

**CSP was never the problem** — it was already correct, in both `vercel.json`
and the `<meta>` mirror. The cause was the site key missing from the bundle,
because the deployment under test had been produced by `vercel redeploy`, which
reuses the previous deployment's environment snapshot from before the variable
existed. **No number of redeploys could ever have fixed it.**

What fixed it was incidental: merging PR #15 triggered the first genuinely new
git-triggered build of `staging` since the variable was added, and the key
inlined correctly.

The bundle could not be inspected from the CLI (`staging.swole.day` is behind
Vercel deployment protection and 302s to `curl`), so this needed a browser
signed in to Vercel.

### Production ships the widget code *compiled out* — read before enabling

Checked at the same time, and it sharpens the enablement warning below.

The production bundle contains **no Turnstile code at all**: no
`challenges.cloudflare.com`, no site key. This is not a stale deployment —
production is the build from PR #16, and its CSP already allows Cloudflare,
which only shipped with the Turnstile commit.

It is **tree-shaking**. With no Production-scoped `VITE_TURNSTILE_SITE_KEY`,
Vite inlines `import.meta.env.VITE_TURNSTILE_SITE_KEY` as `undefined`, both
guards in `TurnstileWidget` constant-fold, and Rollup drops the whole
script-loading path. (The string `turnstile` survives only as the
`window.turnstile` property access, which minifiers don't rename.)

Production **was** therefore in a correct, consistent inert state — both ends
off, sign-up unaffected. **Turnstile was enabled on 2026-08-14**; the order
below is what was followed, and is kept because it is the same order any future
deployment (or a rebuilt production) has to use. The two ends fail
asymmetrically:

| Order | What happens |
| --- | --- |
| Site key + rebuild **first**, secret after | Widget renders, `verifySignupChallenge` returns `{required:false}` and records nothing, `spendSignupChallenge` returns early. Sign-up works throughout. **Safe.** |
| Secret **first** | No widget in the shipped bundle → no token → no pass → `spendSignupChallenge` throws "Please complete the challenge before signing up". **Sign-up breaks for every new user, with no widget on screen to solve.** |

So: **site key and a real rebuild first, secret last.** See "Turning Turnstile on
in production" below for the full runbook.

Test accounts left on staging from this run: `probe2@test.local` (plus failed
attempts). Harmless — preview data now persists between pushes.

CSP was updated for it (`script-src` and `frame-src` both need
`https://challenges.cloudflare.com` — the widget is an iframe, and `frame-src`
falls back to `default-src 'self'` otherwise), including the `<meta>` mirror
that is what actually reaches an installed PWA. Pinned by `vercel-headers.test.ts`.

One behaviour worth knowing, pinned by a test so it isn't "fixed" into
something the transaction model can't honour: rejecting an *expired* pass
throws, and the throw rolls back the delete of that same row, so the stale row
survives. It's harmless — still expired, so it authorises nothing, and solving
a new challenge replaces it rather than stacking.

### Turning Turnstile on in production — runbook

Not yet done. Follow the order exactly: the two ends fail asymmetrically, and
the wrong order breaks sign-up for every new user.

**1. Get real Cloudflare keys.** Dashboard → Turnstile → Add site. Hostname
`swole.day` (add `www.swole.day` too — it 307s to the apex, but costs nothing).
Widget type **Managed**. You get a **site key** (public, starts `0x4AAA…`) and a
**secret key** (private). Staging's `1x…` pair are Cloudflare's always-passes
test keys and must not be used in production.

**2. Site key into Vercel, Production scope.** Project → Settings →
Environment Variables → `VITE_TURNSTILE_SITE_KEY`, value = the site key, scope
**Production** only. Leave staging's Preview-scoped entry alone.

**3. Force a genuinely new build.** This is the step that has already caught
this project out once. Vite inlines `VITE_*` at **build** time, and
`vercel redeploy` reuses the previous deployment's environment snapshot — the
variable will be invisible to it. It must be a real git-triggered build.

Note `main` is protected, so this is a PR, not a push: commit anything trivial
to `dev` → PR to `staging` → PR to `main`. The promotion itself is the trigger.

**4. Verify the key actually reached the bundle *before* going further.**
`swole.day` is public, so this needs no auth:

```js
// In the browser console on https://swole.day
const html = await fetch('/', {cache:'reload'}).then(r => r.text())
const asset = html.match(/\/assets\/[^"]+\.js/)[0]
const js = await fetch(asset, {cache:'reload'}).then(r => r.text())
/0x4AAA[A-Za-z0-9_-]{10,}/.test(js)   // must be true before step 5
```

If that is `false`, **stop** — the build did not pick the variable up, and
setting the secret now is what breaks sign-up. Also confirm the widget renders
on the sign-up form. At this point the widget is live but the server ignores it,
so sign-up keeps working either way. There is no rush between steps 4 and 5.

**5. Secret key onto production Convex — last.**

```bash
npx convex env set TURNSTILE_SECRET_KEY <secret> --prod
npx convex env get TURNSTILE_SECRET_KEY --prod    # confirm
```

This takes effect immediately: it is a runtime variable, no rebuild needed.

**6. Test a real sign-up** on `swole.day` with a throwaway address, then delete
the account.

**Rollback is instant and needs no rebuild** — the asymmetry works in your
favour here:

```bash
npx convex env remove TURNSTILE_SECRET_KEY --prod
```

`spendSignupChallenge` returns early the moment the variable is gone, so
sign-up is unguarded but working again within seconds. That is the lever to
pull if anything goes wrong, *not* a redeploy.

**One operational risk to know about:** verification **fails closed** on a
non-200 from Cloudflare (deliberate — failing open would make the guard
bypassable by waiting for an outage). So a Cloudflare outage stops new sign-ups
until it passes, or until you pull the rollback lever above.

### E. Leaderboard volume is self-reported
Nothing stops a user logging 1500kg × 500 reps to top the volume board. Caps
keep individual numbers sane, but the board is only as honest as its inputs.
A game-integrity question, not a security one — decide whether it matters.

### F. `npm audit`: 4 high, 1 root cause
`react-router` RSC-mode CSRF, only exploitable in RSC mode, which this
client-only SPA does not use. `npm audit fix --force` would downgrade
`react-router` — don't.

---

## Notes for whoever works on this next

- **The rate limiter's own caveat matters.** A Convex mutation is
  all-or-nothing, so a `limit()` that succeeds and is followed by a throw is
  rolled back *including the consumed token*. These limits therefore throttle
  successful operations, not retries of rejected input. That is the right
  behaviour here, but it means a limit cannot be used to punish bad input.
- **Rate limits live at each module's auth funnel**, not on individual
  handlers — `getOwnedWorkout` and the per-file `requireUserId` helpers are the
  single path every write in their module takes. New mutations should go
  through those, not call `getAuthUserId` directly.
- **Queries cannot consume a limit** (the limiter writes). Anything needing
  throttling has to be a mutation.
- `identity.ts:publicIdentity` is the stranger-safe identity helper.
  `friends.ts:profileFor` is the friends-and-public-opt-in one, and
  `profileForWithAvatar` is friends-only. Adding an avatar or any new field to
  the wrong one is how the next leak happens.

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

- `resolveUsername` — any signed-in user can look up any username, and it is
  deliberately unthrottled.
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

### C. `resolveUsername` enumeration is still unthrottled
A reactive query, and the limiter needs write access, so throttling means
converting it to a mutation and changing how `FriendsPage` calls it. Severity
dropped materially now that it no longer returns an email — it reveals only
whether a username exists. Worth doing if abuse appears.

### D. Signup throttle is global, not per-IP
`signUp` is 20 per 10 minutes app-wide, because Convex actions can't see caller
IP. That stops a scripted flood but also means one attacker can consume the
global allowance and **block legitimate signups** — a denial-of-service on
registration. The real fix is a challenge on the signup form (e.g. Cloudflare
Turnstile), which sits outside Convex. **Consider this before any launch push.**

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

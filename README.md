# 🏋️ Swole — Workout Logger & Social Fitness PWA

What started as a Hevy-style workout logger — log sets, track PRs, build routines — has grown a social layer (friends, a feed, chat, challenges) and a nutrition tracker on top. Log a workout, share it, see what your friends are lifting, and log what you ate, all from one installable PWA.

**Live app:** https://swole.day — open it on your phone and *Add to Home Screen* to install it as an app.

## Features

### Workouts & training
- **Workout logging** — start an empty workout or one from a routine; log weight × reps per set, mark warm-ups, check sets off as you go. Every keystroke is saved to the cloud instantly, so a dead phone battery never loses a set.
- **Personal records** — each exercise tracks your best weight and estimated one-rep max (Epley formula). Beat either mid-workout and a 🏆 appears on the set in real time.
- **Rest timer** — starts automatically between sets, with quick presets and a custom duration.
- **History & progress** — every past workout with full detail; per-exercise progress charts of your top set over time, so you can see when you're improving and when you're falling off.
- **Routines** — reusable workout templates. Starting one pre-fills every set with your numbers from last time — you always know what to beat.
- **Reorder mid-workout** — move an exercise up or down the list while logging (or while building a routine template) if you change your mind about the order.
- **Unit preference** — every weight in the app displays in kg or lb per your profile setting; canonical storage stays kg regardless. (Set-weight *entry* is still kg-only — see Roadmap.)
- **Photo share** — after a workout, take or pick a photo and export a 1080×1920 PNG with your session overlaid (exercises, sets, volume, duration, PR badges), ready for the share sheet. Skip the photo and it exports a compact, square, branded card instead. The photo never leaves your device.

### Library
- **Routines + Exercises, one tab** — a segmented control switches between your routine templates and the full exercise library, so both live under one bottom-nav slot.
- **Favorites** — star any exercise from its row, its detail sheet, or mid-workout; filter the library to just your favorites, with each one's PR at a glance. Tapping an exercise opens the same detail sheet everywhere in the app (PR, lifetime volume, progress chart, recent sessions).

### Nutrition
- **Log food two ways** — type in protein/carbs/fat/fiber (calories are derived from the macros, 4/4/9, unless you type your own), or snap a photo and let a vision model (Claude Haiku, via the Vercel AI Gateway) estimate everything for you.
- **Daily targets** — calories and macro targets are computed from your TDEE and whichever goal you picked on My Stats (Maintain/Cut/Bulk/Recomp), with progress bars against today's log.
- **Fails safe** — a daily entry cap, rate limits on both the photo-upload and the paid AI-analysis calls, and every LLM output is range-clamped rather than trusted outright.

### Social — feed, friends & leaderboard
- **Feed** — share a finished workout to Friends-only or Everyone (your choice per post); like, comment, and repost (public posts only — your friends aren't the original poster's friends). Discover public posts from anyone, or report/block from any post's menu.
- **Friends** — add by username (request/accept), or opt into a fully public profile. See a friend's workout history read-only, gated on an accepted friendship or their public opt-in.
- **Leaderboard** — points are earned per *day* you train, not per workout or per kg — the third day of a training week is worth the most. Lifting heavy and hitting PRs still helps, but that's capped well below what showing up earns. Weeks run Monday–Sunday, with a This week / This month toggle and Consistency Accolades badges (Consistent/Dedicated/Relentless/Iron Will) for tenure.
- **Gym pings** — a one-tap, Snapchat-style "get to the gym" nudge between friends.
- **Chat & challenges** — free-text messages with a friend, and friend-vs-friend consistency-streak wagers started right from the chat thread, with points escrowed from both sides on commit.

### Notifications
- **Header bell** — a persistent, always-visible entry point (with an unread dot) to a dedicated notifications inbox, for likes, comments, friend requests, pings, and challenges — on top of the in-page banner that already surfaces the newest few.

### Account, profile & onboarding
- **Profile** — avatar upload with crop, display name, username, member-since date, lifetime counts (workouts, PRs, favorites), and account deletion.
- **My Stats & calorie calculator** — enter height, weight, age, sex, and activity level once; get your BMR/TDEE plus four calorie + macro targets computed live as you type.
- **Onboarding** — a one-time welcome carousel after signup, name + username capture, and a body-stats questionnaire ending in a reward screen. First-visit tips (dismissible one-liners) then introduce each tab the first time you open it, and a "What's new" popup surfaces each release's changes once per account.
- **Feature requests** — a "Suggest a feature" box on Profile; submissions email the developer instantly via Resend.

### Security & reliability
- **Sign-up is CAPTCHA-gated** — Cloudflare Turnstile, verified server-side before an account is created.
- **Email verification & password reset** via 6-digit codes typed in-app (not magic links, so an installed PWA never has to bounce to a system browser); repeated code-send requests and wrong-code guesses are both rate-limited.
- **Rate limiting everywhere it matters** — named limits on every costly or socially-visible action (friend requests, pings, challenges, posts, photo uploads, the paid AI food-photo analysis, sign-up, account deletion, username lookups), plus a blanket per-user write budget behind everything else, so an authenticated client can't hammer its own writes into the ground either.
- **No row-level security layer** — every Convex function resolves the caller (`getAuthUserId`) and checks ownership before touching data, proven by a dedicated cross-user authorization test suite.

### Platform
- **PWA** — installable, app-like, with a cached shell.
- **Gym-themed UI** — a dark gunmetal/rust palette, a faint metal-grain texture, and a small hand-drawn icon set standing in wherever a stat or empty state had no visual before.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | [React](https://react.dev) + [Vite](https://vite.dev) + TypeScript | Fast dev loop; types flow end-to-end from the DB schema into components |
| Styling | [MUI](https://mui.com) v9 + [Emotion](https://emotion.sh) | Component library with a custom dark theme; design tokens live in `src/theme/` |
| Backend | [Convex](https://convex.dev) | Reactive database + serverless functions; `useQuery` results update live across devices with zero refetch code |
| Auth | [Convex Auth](https://labs.convex.dev/auth) | Email/password, JWTs signed server-side; email verification + password reset via Resend-sent 6-digit codes, no third-party auth service |
| Bot protection | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) | Gates sign-up; a solved challenge is handed off from action to mutation via a short-lived, single-use `signupChallenges` row |
| Rate limiting | [`@convex-dev/rate-limiter`](https://www.convex.dev/components/rate-limiter) | Named per-action token buckets/fixed windows, plus a blanket per-user write budget (`convex/rateLimiter.ts`) |
| AI | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) + [AI SDK](https://ai-sdk.dev) | Nutrition photo analysis: one model string (`anthropic/claude-haiku-4.5`), swappable without touching a provider SDK; output validated with Zod and range-clamped before it's trusted |
| Image export | [modern-screenshot](https://github.com/qq15725/modern-screenshot) | Renders the share-card DOM node to a high-res PNG (what you preview is exactly what exports) |
| Email | [Resend](https://resend.com) | One `fetch` call from a Convex action, no SDK — used for verification codes, password reset, and feature-request notifications |
| Testing | [Vitest](https://vitest.dev) + [convex-test](https://github.com/get-convex/convex-test) + [Testing Library](https://testing-library.com) | Runs the real backend functions against an in-memory Convex, and renders real React components with only the Convex hooks mocked |
| Hosting | [Vercel](https://vercel.com) (frontend) + Convex Cloud (backend) | Free tiers, one-command deploys |

## Architecture

```
convex/                 # Backend: schema + all queries/mutations/actions
  schema.ts             #   25 tables — profiles, posts/postLikes/postComments/
                        #   postReports, blockedUsers, friendRequests/friendships,
                        #   gymPings, exercises, routines/routineExercises,
                        #   workouts/workoutExercises/sets, signupChallenges,
                        #   favorites, featureRequests, workoutFeedback,
                        #   messages/threadReads, notifications, challenges,
                        #   foodLogs, personalRecords
  auth.ts, emailAuth.ts #   Convex Auth config + 6-digit-code email providers
  turnstile.ts          #   Cloudflare Turnstile verification for sign-up
  rateLimiter.ts         #   every named rate limit + the blanket write-budget helper
  account.ts            #   account deletion: tears down auth, cascades the purge
  migrations.ts         #   one-off backfills, run once via `npx convex run`
  workouts.ts           #   active-workout lifecycle (start → log → finish), reordering
  history.ts            #   past workouts, progress data, PR recomputation
  exercises.ts          #   built-in library (seeded) + custom exercises
  routines.ts           #   templates + start-from-routine with prefill
  favorites.ts          #   star/unstar an exercise, list favorites joined with PRs
  friends.ts, friendships.ts
                        #   requests/accept, leaderboard, permission-gated
                        #   friend-workouts read
  feed.ts               #   posts, likes, comments, reports, blocking, visibility
  messages.ts, pings.ts, friendThread.ts, challenges.ts
                        #   friend chat, gym pings, and streak-wager challenges —
                        #   friendThread merges the first three into one timeline
  notifications.ts      #   the in-app notification feed + header-bell unread state
  nutrition.ts          #   food logging: manual entries + AI-analyzed photos
  profiles.ts           #   display name, username, body stats, onboarding, points
  points.ts, fitness.ts #   training-day leaderboard scoring; PRs (Epley 1RM),
                        #   TDEE/BMR/macros
  featureRequests.ts    #   saves a suggestion, schedules a Resend email to the owner
  validation.ts         #   server-side input sanitization used by all mutations
  crons.ts              #   scheduled jobs (e.g. settling expired challenges)
  *.test.ts             #   backend test suite (never deployed — see Testing)
src/
  features/<feature>/   # UI grouped by feature: workouts, history, routines,
                        #   exercises, library, favorites (folded into library),
                        #   friends, feed, notifications, nutrition, profile,
                        #   stats, share, auth, onboarding, releases
  components/           # AppLayout (nav + header), ErrorBoundary, FirstVisitTip,
                        #   Avatar, SegmentedControl, TurnstileWidget, icons.tsx
  lib/                  # unit conversion, dates, error formatting, service worker
scripts/                # one-time setup: auth keys, PWA icon generation
```

**How data flows:** components call `useQuery(api.…)` / `useMutation(api.…)` / `useAction(api.…)`. Convex pushes query updates over a websocket, so the UI is always a live render of the database — there is no manual refetching, no cache invalidation, and an in-progress workout survives refreshes and device switches.

**Security model:** there is no row-level security layer — instead **every** Convex function starts by resolving the signed-in user (`getAuthUserId`) and walks ownership before touching anything (`workout → workoutExercise → set`, `foodLog → owner`, …). Finished workouts are immutable. All inputs are sanitized server-side (`convex/validation.ts`): non-finite numbers rejected, lengths capped, enums whitelisted, growth caps enforced. Every write-side function also passes through `convex/rateLimiter.ts` — either a named limit sized to what a real user actually does, or the blanket per-user write budget behind everything else. The frontend ships with a strict Content-Security-Policy via `vercel.json`. The deliberate exceptions where one user's data is shown to another — `friends.friendWorkouts`, the feed's visibility rules — are gated on an explicit accepted-friendship check or an opt-in public flag, checked before any data is read, and proven by a dedicated cross-user authorization test suite (`authz.test.ts`).

**PR logic:** a set is a record if it beats your best weight *or* your best estimated 1RM — `e1RM = weight × (1 + reps/30)`, with a 1-rep set counting as itself. Warm-ups never count. Records are cached per `(user, exercise)` and recomputed from remaining history if you delete a workout.

## Getting Started

Prerequisites: Node 20+ and a free [Convex](https://convex.dev) account.

```bash
git clone https://github.com/TN1DG/swole.git
cd swole
npm install

# 1. Create/link your Convex dev deployment (writes .env.local)
npx convex dev --once

# 2. Generate JWT keys for Convex Auth and set them on the deployment
node scripts/setup-auth-env.mjs

# 3. Seed the built-in exercise library (idempotent)
npx convex run exercises:seed

# 4. Run it — two processes side by side:
npx convex dev        # watches convex/ and pushes functions
npm run dev           # Vite dev server → http://localhost:5173
```

Two optional env vars, both safe to leave unset on a dev deployment:

- `npx convex env set RESEND_API_KEY re_...` — enables outgoing email. Unset, verification/reset codes and feature-request notices are logged instead of emailed (`RESEND_API_KEY not set — <kind> code for <email>: <token>` in the Convex logs), which is usually *more* convenient for local testing.
- `npx convex env set AI_GATEWAY_API_KEY ...` — enables AI food-photo analysis. Unset, the analyze action fails closed with a "log it manually instead" message rather than hanging; manual entry still works either way.

Both are deliberately unset on preview deployments too — pointing a disposable preview at real email or a paid AI call isn't worth it.

## Testing

```bash
npm test              # 431 tests, 32 files, ~9s
```

The full verify routine — what CI runs on every push and PR, and what you should
run before committing:

```bash
npm run typecheck     # tsc -b && tsc --noEmit -p convex — both halves matter
npm run lint          # oxlint, currently zero warnings
npm test              # vitest
npm run build
```

`tsc -b` alone does *not* typecheck `convex/*.test.ts`, which is why
`typecheck` runs both projects.

Backend tests (`convex/*.test.ts`) run the **actual backend functions** against an in-memory Convex (`convex-test`):

- `authz.test.ts` — the security matrix: proves an unauthenticated caller gets nothing and that user B can neither read nor mutate user A's workouts, sets, routines, exercises, PRs, or history through any function.
- `workouts.test.ts` — finish lifecycle, PR detection (first/weight/e1RM/no-PR cases), warm-up exclusion, input validation, growth caps, immutability of finished workouts, exercise reordering.
- `history.test.ts`, `routines.test.ts`, `favorites.test.ts` — record recomputation, template CRUD + prefill, favorite toggling with cross-user isolation.
- `friends.test.ts`, `friendThread.test.ts`, `pings.test.ts`, `challenges.test.ts` — request/accept flows, the leaderboard's security matrix, chat-thread merging across messages/pings/challenges, and the streak-wager escrow/settlement math.
- `feed.test.ts` — post visibility rules (friends/public), like/comment/repost, reporting, and blocking.
- `notifications.test.ts` — the unread feed and mark-read paths behind the header bell.
- `nutrition.test.ts` — manual and photo-based food logging, the daily cap, the fail-closed AI path when unconfigured, and the ownership check binding a photo's `storageId` to its own log entry before it's ever sent to the vision model.
- `account.test.ts`, `avatars.test.ts` — account deletion cascades (including freeing storage blobs), avatar upload/crop.
- `turnstile.test.ts`, `emailAuth.test.ts` — CAPTCHA verification, and the *actual* `auth:signIn` action end to end (sign-up sends a code, wrong code rejected, throttled resends, password reset invalidates the previous session) — all with `fetch` mocked.
- `writeBudget.test.ts` — the blanket per-user rate limit that backstops every mutation not covered by a named limit.
- `featureRequests.test.ts`, `profiles.test.ts`, `fitness.test.ts` — validation + per-user caps, profile defaults/body-stats/onboarding, and the pure math (Epley 1RM, TDEE/BMR/macros, leaderboard scoring).

Frontend component tests (`src/**/*.test.tsx`) render real components with `@testing-library/react` — only the Convex hooks (`useQuery`/`useMutation`/`useAction`) are mocked, keyed by function name, so MUI, routing, and all the actual UI logic run for real. See `ActiveWorkout.test.tsx` for the pattern.

Test files live next to the code they test; the Convex CLI skips any file whose basename has more than one dot (`*.test.ts`, `test.helpers.ts`), so backend tests are never deployed.

## Deployment

Work promotes through **`dev` → `staging` → `main`**, each hop via a reviewed pull
request. New work is committed to `dev`, never to `main`.

| Branch | Deploys to | Convex backend |
|---|---|---|
| `dev` | `swole-git-dev-….vercel.app` | its own preview deployment |
| `staging` | [staging.swole.day](https://staging.swole.day) (behind Vercel SSO) | its own **persistent** preview deployment |
| `main` | [swole.day](https://swole.day) — production | production |

Vercel builds every branch through `scripts/vercel-build.js`. Production gets the
real Convex backend; every other branch gets its own isolated Convex preview
deployment, auto-seeded with the exercise library and auto-configured with its own
auth signing keys. Previews are *reused* across pushes (`--preview-name`), so test
accounts survive — and so a schema change that can't cope with existing rows fails
on staging rather than in production.

`.github/workflows/ci.yml` runs typecheck, lint, tests, and the build on every push
and PR to these three branches. `main` is branch-protected: merging requires a
green check.

<details><summary>Manual deploy — bypasses both PR gates, emergencies only</summary>

```bash
npm run deploy:emergency
```

Named for what it is. Pushes functions straight to the production Convex
deployment, rebuilds the frontend against the prod URL, and deploys `dist/` to
Vercel — bypassing both PR gates, the CI check, and the staging rehearsal, so a
migration or schema change reaches production untested. Use the PR flow.

Production and dev are fully separate deployments with separate databases and
separate signing keys (`node scripts/setup-auth-env.mjs --prod --site-url=https://…`).

</details>

## Roadmap

- kg/lb *entry*, not just display — weights are stored canonically in kg and every display site reads `profiles.unitPreference` via `useWeightUnit()`; the set-weight *inputs* still take kg
- Bodyweight / rep-only PR tracking
- Workout notes UI (schema field already exists)
- Push notifications — the notification feed and header bell are in-app only today, with no OS-level delivery
- Offline logging with sync
- Native iOS/Android wrap via Capacitor

## Licence

[MIT](LICENSE) — © 2026 Oluwatobi Tella Ndanusa. Free to read, fork, modify, and
reuse, including commercially; keep the copyright notice.

---

Built from scratch with [Claude Code](https://claude.com/claude-code) as a learn-by-building project.

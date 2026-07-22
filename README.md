# 🏋️ Swole — Workout Logger PWA

A Hevy-style gym app: log your workouts set by set, track personal records automatically, build routines, and export your session as a shareable photo overlay.

**Live app:** https://swole-six.vercel.app — open it on your phone and *Add to Home Screen* to install it as an app.

## Features

- **Workout logging** — start an empty workout or one from a routine; log weight × reps per set, mark warm-ups, check sets off as you go. Every keystroke is saved to the cloud instantly, so a dead phone battery never loses a set.
- **Personal records** — each exercise tracks your best weight and estimated one-rep max (Epley formula). Beat either mid-workout and a 🏆 appears on the set in real time.
- **History & progress** — every past workout with full detail; per-exercise progress charts of your top set over time, so you can see when you're improving and when you're falling off.
- **Routines** — reusable workout templates. Starting one pre-fills every set with your numbers from last time — you always know what to beat.
- **Reorder mid-workout** — move an exercise up or down the list while logging (or while building a routine template) if you change your mind about the order.
- **Favorites** — star any exercise from the library, its detail sheet, or mid-workout; the Favorites tab lists them with their PR at a glance. Tapping one opens the same detail sheet used everywhere else in the app (PR, lifetime volume, progress chart, recent sessions) — one unified view of a lift's stats regardless of where you tapped in from.
- **Profile** — display name, member-since date, and quick lifetime counts (workouts, PRs, favorites), plus sign out.
- **My Stats & calorie calculator** — enter height, weight, age, sex, and activity level once; get your BMR/TDEE plus four calorie + macro targets (Maintain, Cut, Bulk, Recomp) computed live as you type — protein set by bodyweight, fat as a %, carbs from what's left, fiber from the standard dietary guideline.
- **Friends & leaderboard** — add friends by username (request/accept, or opt in to a fully public profile); see a friend's workout history read-only, and a leaderboard ranked by this week's volume with a consistency-streak bonus (+5%/consecutive week, capped +50%) and "Consistency Accolades" badges (Consistent/Dedicated/Relentless/Iron Will).
- **Photo share** — after a workout, take or pick a photo and export a 1080×1920 PNG with your session overlaid (exercises, sets, volume, duration, PR badges), ready for the share sheet. Skip the photo and it exports a compact, square, branded card instead — no giant empty frame. The photo never leaves your device.
- **PWA** — installable, app-like, with a cached shell.
- **Gym-themed UI** — a dark gunmetal/rust color palette, a faint metal-grain texture, and a small hand-drawn icon set (barbell, plate, stopwatch, checklist, heart) standing in wherever a stat or empty state had no visual before.
- **Feature requests** — a "Suggest a feature" box on the Profile page; submissions email the developer instantly via Resend.
- **Onboarding** — a one-time welcome carousel right after signup (consistency, community, and the app's own story), name + username capture, and a body-stats questionnaire that ends in a reward screen showing your calorie/macro breakdown. First-visit tips (one-liners, dismissible) then introduce each main tab the first time you open it.
- **Account security** — email verification and password reset, both via 6-digit codes typed in-app (not magic links, so an installed PWA never has to bounce to a system browser); failed sign-in/code attempts and repeated code-send requests are both rate-limited.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | [React](https://react.dev) + [Vite](https://vite.dev) + TypeScript | Fast dev loop; types flow end-to-end from the DB schema into components |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) | Mobile-first utilities, design tokens in one `@theme` block |
| Backend | [Convex](https://convex.dev) | Reactive database + serverless functions; `useQuery` results update live across devices with zero refetch code |
| Auth | [Convex Auth](https://labs.convex.dev/auth) | Email/password, JWTs signed server-side; email verification + password reset via Resend-sent 6-digit codes, no third-party auth service |
| Image export | [modern-screenshot](https://github.com/qq15725/modern-screenshot) | Renders the share-card DOM node to a high-res PNG (what you preview is exactly what exports) |
| Email | [Resend](https://resend.com) | One `fetch` call from a Convex action, no SDK — used to email the developer on feature-request submissions |
| Testing | [Vitest](https://vitest.dev) + [convex-test](https://github.com/get-convex/convex-test) | Runs the real backend functions against an in-memory Convex |
| Hosting | [Vercel](https://vercel.com) (frontend) + Convex Cloud (backend) | Free tiers, one-command deploys |

## Architecture

```
convex/                 # Backend: schema + all queries/mutations
  schema.ts             #   13 tables: exercises, workouts, sets, routines, PRs,
                        #   favorites, friendRequests, friendships, featureRequests,
                        #   emailSendAttempts…
  auth.ts               #   Convex Auth config: Password provider + verify/reset
  emailAuth.ts          #   6-digit-code email providers for verify/reset, Resend
                        #   send + its own throttle (auth's own rate limiter only
                        #   covers wrong-password/wrong-code guesses, not resends)
  migrations.ts         #   one-off backfills (emailVerified, onboardedAt) — run
                        #   once via `npx convex run`, safe to delete after
  workouts.ts           #   active-workout lifecycle (start → log → finish), reordering
  history.ts            #   past workouts, progress data, PR recomputation;
                        #   summarizeWorkout is shared with friends.ts
  exercises.ts          #   built-in library (70 seeded) + custom exercises
  routines.ts           #   templates + start-from-routine with prefill
  favorites.ts          #   star/unstar an exercise, list favorites joined with PRs
  friends.ts            #   requests/accept, leaderboard, permission-gated
                        #   friend-workouts read (first cross-user data access)
  featureRequests.ts    #   saves a suggestion, schedules a Resend email to the owner
  profiles.ts           #   display name, username, body stats for TDEE, onboarding
  prs.ts, fitness.ts    #   PRs (Epley 1RM), TDEE/BMR/macros, leaderboard scoring
  validation.ts         #   server-side input sanitization used by all mutations
  *.test.ts             #   test suite (never deployed — see Testing)
src/
  features/<feature>/   # UI grouped by feature: workouts, history, routines,
                        #   exercises, favorites, friends, profile, stats, share,
                        #   auth, onboarding
  components/           # AppLayout (nav), ErrorBoundary, FirstVisitTip, icons.tsx
  lib/
scripts/                # one-time setup: auth keys, PWA icon generation
```

**How data flows:** components call `useQuery(api.…)` / `useMutation(api.…)`. Convex pushes query updates over a websocket, so the UI is always a live render of the database — there is no manual refetching, no cache invalidation, and an in-progress workout survives refreshes and device switches.

**Security model:** there is no row-level security layer — instead **every** Convex function starts by resolving the signed-in user (`getAuthUserId`) and walks ownership before touching anything (`workout → workoutExercise → set`). Finished workouts are immutable. All inputs are sanitized server-side (`convex/validation.ts`): non-finite numbers rejected, lengths capped, enums whitelisted, growth caps enforced. The frontend ships with a strict Content-Security-Policy and friends via `vercel.json`. The one deliberate exception is `friends.friendWorkouts`, which shows one user's data to another *by design* — gated on an explicit accepted-friendship check or an opt-in `workoutsPublic` flag, checked before any workout data is read.

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

# 3. Seed the built-in exercise library (70 exercises, idempotent)
npx convex run exercises:seed

# 4. Run it — two processes side by side:
npx convex dev        # watches convex/ and pushes functions
npm run dev           # Vite dev server → http://localhost:5173
```

Optional: `npx convex env set RESEND_API_KEY re_...` to enable feature-request emails (get a free key at [resend.com](https://resend.com)). Without it, submissions still save — the email send is just skipped with a console warning.

## Testing

```bash
npm test              # 92 tests, ~2s
```

The suite runs the **actual backend functions** against an in-memory Convex (`convex-test`):

- `authz.test.ts` — the security matrix: proves an unauthenticated caller gets nothing and that user B can neither read nor mutate user A's workouts, sets, routines, exercises, PRs, or history through any function.
- `workouts.test.ts` — finish lifecycle (incomplete sets discarded, empty workouts dropped), PR detection (first/weight/e1RM/no-PR cases), warm-up exclusion, input validation (NaN/Infinity/oversized rejected), growth caps, immutability of finished workouts, exercise reordering (swap up/down, no-op past either end, cross-user rejection).
- `history.test.ts` — record recomputation after deleting workouts, pagination.
- `routines.test.ts` — CRUD, last-performance prefill, active-workout guard.
- `favorites.test.ts` — toggle on/off, joined PR data, rejects favoriting an exercise you can't see, cross-user isolation.
- `friends.test.ts` — request/accept/decline, two-way friendship on accept, leaderboard scoring, and the security matrix for the one query that intentionally crosses users: a stranger can't view your workouts, a friend can, a public opt-in overrides for anyone.
- `featureRequests.test.ts` — validation, per-user cap, and the scheduled Resend email path with `fetch` mocked (never hits the real network in tests).
- `profiles.test.ts` — defaults before a profile row exists, set/clear display name and body stats, validation, cross-user isolation, onboarding identity save + finish, first-visit tip tracking.
- `emailAuth.test.ts` — runs the *actual* `auth:signIn` action end to end (not just mutations): sign-up sends a code, wrong code is rejected, an already-verified account skips straight to sign-in, repeated code-sends are throttled, and password reset invalidates the previous session — all with `fetch` mocked.
- `fitness.test.ts` — the pure math: Epley 1RM/PR checks, TDEE/BMR/macro calculations, and the consistency-streak/leaderboard scoring.

Test files live in `convex/` next to the code they test; the Convex CLI skips any file whose basename has more than one dot (`*.test.ts`, `test.helpers.ts`), so they are never deployed.

## Deployment

```bash
npm run deploy
```

One command: pushes functions to the production Convex deployment, rebuilds the frontend against the prod URL, and deploys `dist/` to Vercel. Production and dev are fully separate deployments with separate databases and separate signing keys (`node scripts/setup-auth-env.mjs --prod --site-url=https://…`).

## Roadmap

- Rest timer between sets
- kg/lb display toggle (weights are stored canonically in kg; the profile's `unitPreference` field exists but isn't wired into any display yet)
- Bodyweight / rep-only PR tracking
- Workout notes UI (schema field already exists)
- Offline logging with sync
- Native iOS/Android wrap via Capacitor

---

Built from scratch with [Claude Code](https://claude.com/claude-code) as a learn-by-building project.

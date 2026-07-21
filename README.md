# 🏋️ Swole — Workout Logger PWA

A Hevy-style gym app: log your workouts set by set, track personal records automatically, build routines, and export your session as a shareable photo overlay.

**Live app:** https://swole-six.vercel.app — open it on your phone and *Add to Home Screen* to install it as an app.

## Features

- **Workout logging** — start an empty workout or one from a routine; log weight × reps per set, mark warm-ups, check sets off as you go. Every keystroke is saved to the cloud instantly, so a dead phone battery never loses a set.
- **Personal records** — each exercise tracks your best weight and estimated one-rep max (Epley formula). Beat either mid-workout and a 🏆 appears on the set in real time.
- **History & progress** — every past workout with full detail; per-exercise progress charts of your top set over time, so you can see when you're improving and when you're falling off.
- **Routines** — reusable workout templates. Starting one pre-fills every set with your numbers from last time — you always know what to beat.
- **Favorites** — star any exercise from the library, its detail sheet, or mid-workout; the Favorites tab lists them with their PR at a glance. Tapping one opens the same detail sheet used everywhere else in the app (PR, lifetime volume, progress chart, recent sessions) — one unified view of a lift's stats regardless of where you tapped in from.
- **Profile** — display name, member-since date, and quick lifetime counts (workouts, PRs, favorites), plus sign out.
- **Photo share** — after a workout, take or pick a photo and export a 1080×1920 PNG with your session overlaid (exercises, sets, volume, duration, PR badges), ready for the share sheet. Skip the photo and it exports a compact, square, branded card instead — no giant empty frame. The photo never leaves your device.
- **PWA** — installable, app-like, with a cached shell.
- **Gym-themed UI** — a dark gunmetal/rust color palette, a faint metal-grain texture, and a small hand-drawn icon set (barbell, plate, stopwatch, checklist, heart) standing in wherever a stat or empty state had no visual before.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | [React](https://react.dev) + [Vite](https://vite.dev) + TypeScript | Fast dev loop; types flow end-to-end from the DB schema into components |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) | Mobile-first utilities, design tokens in one `@theme` block |
| Backend | [Convex](https://convex.dev) | Reactive database + serverless functions; `useQuery` results update live across devices with zero refetch code |
| Auth | [Convex Auth](https://labs.convex.dev/auth) | Email/password, JWTs signed server-side, no third-party service |
| Image export | [modern-screenshot](https://github.com/qq15725/modern-screenshot) | Renders the share-card DOM node to a high-res PNG (what you preview is exactly what exports) |
| Testing | [Vitest](https://vitest.dev) + [convex-test](https://github.com/get-convex/convex-test) | Runs the real backend functions against an in-memory Convex |
| Hosting | [Vercel](https://vercel.com) (frontend) + Convex Cloud (backend) | Free tiers, one-command deploys |

## Architecture

```
convex/                 # Backend: schema + all queries/mutations
  schema.ts             #   9 tables: exercises, workouts, sets, routines, PRs, favorites…
  workouts.ts           #   active-workout lifecycle (start → log → finish)
  history.ts            #   past workouts, progress data, PR recomputation
  exercises.ts          #   built-in library (70 seeded) + custom exercises
  routines.ts           #   templates + start-from-routine with prefill
  favorites.ts          #   star/unstar an exercise, list favorites joined with PRs
  profiles.ts           #   display name + lifetime stats, created on first edit
  prs.ts, fitness.ts    #   personal records; Epley 1RM math (shared with UI)
  validation.ts         #   server-side input sanitization used by all mutations
  *.test.ts             #   test suite (never deployed — see Testing)
src/
  features/<feature>/   # UI grouped by feature: workouts, history, routines,
                        #   exercises, favorites, profile, share, auth
  components/           # AppLayout (nav), ErrorBoundary, shared icons.tsx
  lib/
scripts/                # one-time setup: auth keys, PWA icon generation
```

**How data flows:** components call `useQuery(api.…)` / `useMutation(api.…)`. Convex pushes query updates over a websocket, so the UI is always a live render of the database — there is no manual refetching, no cache invalidation, and an in-progress workout survives refreshes and device switches.

**Security model:** there is no row-level security layer — instead **every** Convex function starts by resolving the signed-in user (`getAuthUserId`) and walks ownership before touching anything (`workout → workoutExercise → set`). Finished workouts are immutable. All inputs are sanitized server-side (`convex/validation.ts`): non-finite numbers rejected, lengths capped, enums whitelisted, growth caps enforced. The frontend ships with a strict Content-Security-Policy and friends via `vercel.json`.

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

## Testing

```bash
npm test              # 55 tests, ~1.5s
```

The suite runs the **actual backend functions** against an in-memory Convex (`convex-test`):

- `authz.test.ts` — the security matrix: proves an unauthenticated caller gets nothing and that user B can neither read nor mutate user A's workouts, sets, routines, exercises, PRs, or history through any function.
- `workouts.test.ts` — finish lifecycle (incomplete sets discarded, empty workouts dropped), PR detection (first/weight/e1RM/no-PR cases), warm-up exclusion, input validation (NaN/Infinity/oversized rejected), growth caps, immutability of finished workouts.
- `history.test.ts` — record recomputation after deleting workouts, pagination.
- `routines.test.ts` — CRUD, last-performance prefill, active-workout guard.
- `favorites.test.ts` — toggle on/off, joined PR data, rejects favoriting an exercise you can't see, cross-user isolation.
- `profiles.test.ts` — defaults before a profile row exists, set/clear display name, validation, cross-user isolation.
- `fitness.test.ts` — the pure math.

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
- Password reset + email verification (needs an email provider)
- Offline logging with sync
- Native iOS/Android wrap via Capacitor

---

Built from scratch with [Claude Code](https://claude.com/claude-code) as a learn-by-building project.

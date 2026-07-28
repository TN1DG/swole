import { internalMutation } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { utcWeekStart, WEEK_MS } from './fitness'
import { reconcileWeek } from './points'

// One-off, run manually before deploying email verification to a deployment
// that already has real accounts:
//   npx convex run migrations:backfillEmailVerified [--prod]
//
// Without this, any existing account (the owner's own dev account, any
// friends already testing) would be forced through "enter your code" on its
// very next sign-in the moment `verify` is turned on in convex/auth.ts —
// Password.js checks `if (config.verify && !account.emailVerified)` on every
// sign-in, not just sign-up.
export const backfillEmailVerified = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query('authAccounts').collect()
    let patched = 0
    for (const account of accounts) {
      if (account.provider === 'password' && !account.emailVerified) {
        await ctx.db.patch(account._id, { emailVerified: account.providerAccountId })
        patched++
      }
    }
    return { patched, total: accounts.length }
  },
})

// One-off, paired with the above: marks any profile that already has both a
// username and a display name as "onboarded", so an existing tester isn't
// shown the new welcome carousel for a profile they already set up.
//   npx convex run migrations:backfillOnboarded [--prod]
export const backfillOnboarded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query('profiles').collect()
    let patched = 0
    for (const profile of profiles) {
      if (profile.username && profile.displayName && !profile.onboardedAt) {
        await ctx.db.patch(profile._id, { onboardedAt: Date.now() })
        patched++
      }
    }
    return { patched, total: profiles.length }
  },
})

// One-off, run once per deployment when the Swole Points rework ships:
//   npx convex run migrations:backfillScoring [--prod]
//
// Stamps volumeKg/setCount/prCount and then pointsAwarded on recent completed
// workouts. Without it the week and month leaderboards read zero for everyone
// on day one, because both are a SUM of pointsAwarded and no existing row has
// that field.
//
// Deliberately does NOT touch profiles.pointsBalance. Those balances are live
// currency that may already be escrowed in a pending or active challenge, and
// re-deriving them under the new rules could take points off someone
// mid-wager — unrecoverable and unexplainable. The
// "balance == sum of awards" invariant begins here; older history is
// grandfathered.
//
// Eight weeks is enough for "this week", "this month" and the 12-week streak
// lookback to be right immediately. Older rows keep pointsAwarded undefined
// and read as 0, which nothing the UI shows ever sums.
const BACKFILL_WEEKS = 8

export const backfillScoring = internalMutation({
  args: {},
  handler: async (ctx) => {
    const since = utcWeekStart(Date.now()) - BACKFILL_WEEKS * WEEK_MS
    const workouts = (await ctx.db.query('workouts').collect())
      .filter((w) => w.endedAt !== undefined && w.startedAt >= since)

    // Pass 1: the denormalized stats, walking sets the one and only time.
    for (const workout of workouts) {
      const workoutExercises = await ctx.db
        .query('workoutExercises')
        .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
        .collect()

      let volumeKg = 0
      let setCount = 0
      for (const we of workoutExercises) {
        const sets = await ctx.db
          .query('sets')
          .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
          .collect()
        const completed = sets.filter((s) => s.completed)
        setCount += completed.length
        volumeKg += completed
          .filter((s) => !s.isWarmup && s.weightKg > 0 && s.reps > 0)
          .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
      }

      // prCount is approximated from records still pointing at this workout.
      // A PR that has since been superseded is unrecoverable — eight weeks of
      // slightly low PR bonuses is a fair price for not replaying all history.
      const records = await ctx.db
        .query('personalRecords')
        .withIndex('by_owner', (q) => q.eq('ownerId', workout.ownerId))
        .collect()
      const prCount = records.filter((r) => r.workoutId === workout._id).length

      await ctx.db.patch(workout._id, { volumeKg, setCount, prCount })
    }

    // Pass 2: replay each affected (owner, week) through the same
    // reconciliation the live code uses, so the backfill can't disagree with
    // what finish() would have produced.
    const weeks = new Map<string, { ownerId: Id<'users'>; weekStart: number }>()
    for (const w of workouts) {
      const weekStart = utcWeekStart(w.startedAt)
      weeks.set(`${w.ownerId}:${weekStart}`, { ownerId: w.ownerId, weekStart })
    }
    for (const { ownerId, weekStart } of weeks.values()) {
      await reconcileWeek(ctx, ownerId, weekStart)
    }

    return { workouts: workouts.length, weeksReconciled: weeks.size }
  },
})

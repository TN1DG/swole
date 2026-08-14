import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { adjustPoints } from './profiles'
import {
  distinctTrainingDays,
  streakEndingAt,
  utcWeekIndex,
  utcWeekStart,
  weeklyPointsIncrements,
  WEEK_MS,
} from './fitness'

// How far back a scoring read has to look to know a streak. The multiplier
// caps at STREAK_BONUS_CAP_WEEKS (10), so 12 is everything scoring can use —
// this is what keeps every read bounded instead of scanning lifetime history
// the way the old leaderboard did.
export const SCORING_LOOKBACK_WEEKS = 12

type ScoredWorkout = {
  _id: Id<'workouts'>
  startedAt: number
  volumeKg: number
  prCount: number
  pointsAwarded: number
}

/**
 * Every finished workout for one user in [from, to), plus the denormalized
 * scoring fields with their pre-migration defaults applied.
 *
 * One ranged index read. `endedAt` is filtered in JS rather than with
 * `.filter()` because a Convex filter after `withIndex` does not reduce the
 * rows actually read — it only hides them.
 */
export async function finishedWorkoutsBetween(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  from: number,
  to: number,
): Promise<ScoredWorkout[]> {
  const rows = await ctx.db
    .query('workouts')
    .withIndex('by_owner_startedAt', (q) =>
      q.eq('ownerId', userId).gte('startedAt', from).lt('startedAt', to),
    )
    .collect()

  return rows
    .filter((w) => w.endedAt !== undefined)
    .map((w) => ({
      _id: w._id,
      startedAt: w.startedAt,
      volumeKg: w.volumeKg ?? 0,
      prCount: w.prCount ?? 0,
      pointsAwarded: w.pointsAwarded ?? 0,
    }))
}

/** Which calendar weeks this user trained in, for streak math. */
export function trainedWeekSet(workouts: { startedAt: number }[]): Set<number> {
  return new Set(workouts.map((w) => utcWeekIndex(w.startedAt)))
}

/**
 * Recomputes one calendar week's points for one user and settles the
 * difference against their balance.
 *
 * Idempotent: call it after ANY change to that week's workouts — finishing
 * one, deleting one — and it converges on the correct answer. That is why
 * both `workouts.finish` and `history.deleteWorkout` call this same function
 * rather than each doing their own arithmetic.
 *
 * This is the ONLY thing permitted to write `workouts.pointsAwarded`. If
 * anything else stamps that field, the balance and the leaderboard diverge
 * silently and nothing will tell you.
 *
 * `removedAward` is what a just-deleted workout had been credited. It has to
 * be passed in because this function reconciles against the rows that still
 * exist, and a deleted row is not among them — without it the deleted
 * workout's points would stay in the balance forever, and delete-and-relog
 * would be a points printer.
 *
 * Returns the net delta applied to the balance.
 */
export async function reconcileWeek(
  ctx: MutationCtx,
  userId: Id<'users'>,
  anyMsInTheWeek: number,
  removedAward = 0,
): Promise<number> {
  const weekStart = utcWeekStart(anyMsInTheWeek)
  const weekEnd = weekStart + WEEK_MS
  const lookbackStart = weekStart - SCORING_LOOKBACK_WEEKS * WEEK_MS

  // One read covers both the week being scored and the streak that multiplies
  // it.
  const history = await finishedWorkoutsBetween(ctx, userId, lookbackStart, weekEnd)
  const streakWeeks = streakEndingAt(trainedWeekSet(history), utcWeekIndex(weekStart))

  const inWeek = history
    .filter((w) => w.startedAt >= weekStart)
    .sort((a, b) => a.startedAt - b.startedAt)

  const increments = weeklyPointsIncrements(inWeek, streakWeeks)

  // Settle the difference between what each row currently claims to have
  // awarded and what it should award now. Deleting day 1 of a three-day week
  // re-prices days 2 and 3 down the curve, so surviving rows get re-stamped
  // too, not just the changed one.
  let delta = -removedAward
  for (const [i, w] of inWeek.entries()) {
    // One increment per input workout, in the same order: `inWeek` is sorted
    // by `startedAt` above to match the sort inside weeklyPointsIncrements, so
    // index `i` refers to the same workout on both sides. That alignment is
    // load-bearing — pairing a workout with someone else's increment would
    // silently mis-award points rather than throw.
    const next = increments[i]!
    if (w.pointsAwarded !== next) {
      delta += next - w.pointsAwarded
      await ctx.db.patch(w._id, { pointsAwarded: next })
    }
  }

  if (delta !== 0) await adjustPoints(ctx, userId, delta)
  return delta
}

/**
 * Points earned in an arbitrary window, plus the stats behind them.
 *
 * `points` is a SUM of the stamped per-workout awards rather than a fresh
 * `weeklyPoints` call, so what the leaderboard shows is exactly what hit the
 * balance. For a month — which spans several weeks, each with its own streak
 * multiplier — re-deriving it any other way would not even be well defined.
 */
export function summarizePeriod(workouts: ScoredWorkout[]) {
  return {
    points: workouts.reduce((sum, w) => sum + w.pointsAwarded, 0),
    daysTrained: distinctTrainingDays(workouts.map((w) => w.startedAt)),
    volumeKg: workouts.reduce((sum, w) => sum + w.volumeKg, 0),
    workoutCount: workouts.length,
  }
}

import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { requireWriter } from './rateLimiter'
import type { Doc, Id } from './_generated/dataModel'
import { beatsRecord, epley1rm } from './fitness'
import { reconcileWeek } from './points'

// exerciseHistory looks at this many recent completed workouts at most, so
// the query stays within Convex read limits as history grows for years.
const HISTORY_SCAN_LIMIT = 200

// Working sets = completed, not warm-up, with real weight/reps.
function workingSets(sets: Doc<'sets'>[]) {
  return sets.filter((s) => s.completed && !s.isWarmup && s.weightKg > 0 && s.reps > 0)
}

// One workout's summary card: exercises + set count + total volume. Shared
// by the owner's own history list and the friend-workouts view (same shape,
// different whose workouts).
export async function summarizeWorkout(ctx: QueryCtx | MutationCtx, workout: Doc<'workouts'>) {
  const workoutExercises = await ctx.db
    .query('workoutExercises')
    .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
    .collect()

  let totalVolumeKg = 0
  let setCount = 0
  const exercises: { name: string; setCount: number }[] = []

  for (const we of workoutExercises.sort((a, b) => a.position - b.position)) {
    const sets = await ctx.db
      .query('sets')
      .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
      .collect()
    const exercise = await ctx.db.get(we.exerciseId)
    setCount += sets.length
    totalVolumeKg += workingSets(sets).reduce((sum, s) => sum + s.weightKg * s.reps, 0)
    exercises.push({ name: exercise?.name ?? '?', setCount: sets.length })
  }

  return {
    _id: workout._id,
    name: workout.name,
    startedAt: workout.startedAt,
    durationMs: (workout.endedAt ?? workout.startedAt) - workout.startedAt,
    totalVolumeKg,
    setCount,
    exercises,
  }
}

// ---------- queries ----------

// Completed workouts, newest first, paginated (the list grows forever, so
// the client asks for pages instead of the whole table).
export const listCompleted = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const result = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .order('desc')
      .filter((q) => q.neq(q.field('endedAt'), undefined))
      .paginate(args.paginationOpts)

    const page = await Promise.all(result.page.map((workout) => summarizeWorkout(ctx, workout)))

    // Same pagination envelope Convex produced, with our enriched page.
    return { ...result, page }
  },
})

// A calendar view never needs more than a month(+padding) at a time — bounded
// range instead of paginated, since that's realistically a few dozen rows.
const MAX_CALENDAR_RANGE_MS = 40 * 24 * 60 * 60 * 1000

// Completed workouts whose startedAt falls in [startMs, endMs) — the
// CalendarView groups these into local calendar days client-side (see
// src/features/history/CalendarView.tsx for why that grouping lives there
// and not here: the app has no server-side timezone concept).
export const listForCalendar = query({
  args: { startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    if (args.endMs <= args.startMs || args.endMs - args.startMs > MAX_CALENDAR_RANGE_MS) {
      throw new Error('Invalid range')
    }

    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .filter((q) =>
        q.and(
          q.neq(q.field('endedAt'), undefined),
          q.gte(q.field('startedAt'), args.startMs),
          q.lt(q.field('startedAt'), args.endMs),
        ),
      )
      .collect()

    return Promise.all(workouts.map((w) => summarizeWorkout(ctx, w)))
  },
})

// Every exercise + its sets for a workout, ordered — shared by getDetail
// (owner-only) and friends.getFriendWorkoutDetail (friend/public read-only),
// which differ only in who's allowed to call and whose PR list gets checked.
export async function getWorkoutExercises(ctx: QueryCtx | MutationCtx, workoutId: Id<'workouts'>) {
  const workoutExercises = await ctx.db
    .query('workoutExercises')
    .withIndex('by_workout', (q) => q.eq('workoutId', workoutId))
    .collect()

  return Promise.all(
    workoutExercises
      .sort((a, b) => a.position - b.position)
      .map(async (we) => {
        const sets = await ctx.db
          .query('sets')
          .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
          .collect()
        return {
          workoutExerciseId: we._id,
          exercise: (await ctx.db.get(we.exerciseId))!,
          sets: sets.sort((a, b) => a.setNumber - b.setNumber),
        }
      }),
  )
}

// Full workout detail: every exercise with every set, plus which exercises
// earned a PR in this workout (records still pointing at it).
export const getDetail = query({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const workout = await ctx.db.get(args.workoutId)
    if (!workout || workout.ownerId !== userId) return null

    const exercises = await getWorkoutExercises(ctx, workout._id)

    const records = await ctx.db
      .query('personalRecords')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    const prExerciseIds = records
      .filter((r) => r.workoutId === workout._id)
      .map((r) => r.exerciseId)

    // Which records this workout's sets may be measured against for the
    // "conquered" red slash. A record only applies to the workout that set
    // it and to workouts logged afterwards — slashing sets in workouts that
    // happened BEFORE the PR would rewrite history with knowledge the lifter
    // didn't have yet. The explicit `workoutId` check isn't redundant with
    // the timestamp one: a PR's `achievedAt` is stamped at finish time, which
    // is always *after* its own workout's `startedAt`.
    const eligibleRecords = records
      .filter((r) => r.workoutId === workout._id || workout.startedAt >= r.achievedAt)
      .map((r) => ({
        exerciseId: r.exerciseId,
        bestWeightKg: r.bestWeightKg,
        bestEst1rm: r.bestEst1rm,
      }))

    return { ...workout, exercises, prExerciseIds, eligibleRecords }
  },
})

// Per-exercise progress across completed workouts (for the chart), oldest first.
export const exerciseHistory = query({
  args: { exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    // Newest-first, capped scan — old history beyond the cap simply falls
    // off the chart rather than blowing up the query.
    //
    // `.take()`, not `.collect()` then slice: the cap has to apply to what the
    // database *reads*, not to what survives filtering afterwards. Collecting
    // first meant every workout the account had ever logged was loaded to show
    // a 200-point chart, so this query grew without bound and would eventually
    // trip Convex's per-transaction read limit and fail outright.
    //
    // +1 because at most one workout can be unfinished — `start` returns the
    // existing active one instead of creating a second, and `cancel` deletes
    // rather than marking. So one extra row is enough to still yield
    // HISTORY_SCAN_LIMIT finished ones. `by_owner_startedAt` orders by the
    // field this actually means by "newest", and is prefix-usable for owner.
    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner_startedAt', (q) => q.eq('ownerId', userId))
      .order('desc')
      .take(HISTORY_SCAN_LIMIT + 1)

    const sessions: {
      workoutId: Id<'workouts'>
      startedAt: number
      topWeightKg: number
      topWeightReps: number
      bestE1rm: number
      volumeKg: number
      setCount: number
    }[] = []

    for (const workout of workouts
      .filter((w) => w.endedAt !== undefined)
      .slice(0, HISTORY_SCAN_LIMIT)) {
      const workoutExercises = await ctx.db
        .query('workoutExercises')
        .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
        .collect()

      const matching = workoutExercises.filter((we) => we.exerciseId === args.exerciseId)
      if (matching.length === 0) continue

      let top: Doc<'sets'> | null = null
      let bestE1rm = 0
      let volumeKg = 0
      let setCount = 0

      for (const we of matching) {
        const sets = await ctx.db
          .query('sets')
          .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
          .collect()
        for (const s of workingSets(sets)) {
          setCount++
          volumeKg += s.weightKg * s.reps
          bestE1rm = Math.max(bestE1rm, epley1rm(s.weightKg, s.reps))
          if (!top || s.weightKg > top.weightKg ||
              (s.weightKg === top.weightKg && s.reps > top.reps)) {
            top = s
          }
        }
      }
      if (!top) continue

      sessions.push({
        workoutId: workout._id,
        startedAt: workout.startedAt,
        topWeightKg: top.weightKg,
        topWeightReps: top.reps,
        bestE1rm,
        volumeKg,
        setCount,
      })
    }

    return sessions.sort((a, b) => a.startedAt - b.startedAt)
  },
})

// ---------- mutations ----------

// Rebuild an exercise's record from scratch out of remaining history.
// Used after deleting a workout so records never point at ghost data.
async function recomputeRecord(
  ctx: MutationCtx,
  userId: Id<'users'>,
  exerciseId: Id<'exercises'>,
) {
  const existing = await ctx.db
    .query('personalRecords')
    .withIndex('by_owner_exercise', (q) =>
      q.eq('ownerId', userId).eq('exerciseId', exerciseId),
    )
    .unique()
  if (existing) await ctx.db.delete(existing._id)

  const workouts = await ctx.db
    .query('workouts')
    .withIndex('by_owner', (q) => q.eq('ownerId', userId))
    .collect()

  type RecordCandidate = {
    ownerId: Id<'users'>
    exerciseId: Id<'exercises'>
    bestWeightKg: number
    bestWeightReps: number
    bestEst1rm: number
    achievedAt: number
    workoutId: Id<'workouts'>
  }
  let best: RecordCandidate | null = null

  for (const workout of workouts
    .filter((w) => w.endedAt !== undefined)
    .sort((a, b) => a.startedAt - b.startedAt)) {
    const workoutExercises = await ctx.db
      .query('workoutExercises')
      .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
      .collect()

    for (const we of workoutExercises.filter((we) => we.exerciseId === exerciseId)) {
      const sets = await ctx.db
        .query('sets')
        .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
        .collect()
      for (const s of workingSets(sets)) {
        // Read previous bests into annotated locals first — assigning `best`
        // from an expression that references `best` trips a TS inference
        // cycle inside loops (TS7022 / bogus `never`).
        const prevWeight: number = best === null ? 0 : best.bestWeightKg
        const prevReps: number = best === null ? 0 : best.bestWeightReps
        const prev1rm: number = best === null ? 0 : best.bestEst1rm

        if (best === null || beatsRecord(s.weightKg, s.reps, best)) {
          best = {
            ownerId: userId,
            exerciseId,
            bestWeightKg: Math.max(prevWeight, s.weightKg),
            bestWeightReps: s.weightKg > prevWeight ? s.reps : prevReps,
            bestEst1rm: Math.max(prev1rm, epley1rm(s.weightKg, s.reps)),
            achievedAt: workout.endedAt ?? workout.startedAt,
            workoutId: workout._id,
          }
        }
      }
    }
  }

  if (best) await ctx.db.insert('personalRecords', best)
}

// Delete a completed workout and its children, then fix affected records.
export const deleteWorkout = mutation({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const workout = await ctx.db.get(args.workoutId)
    if (!workout || workout.ownerId !== userId) throw new Error('Workout not found')

    const workoutExercises = await ctx.db
      .query('workoutExercises')
      .withIndex('by_workout', (q) => q.eq('workoutId', args.workoutId))
      .collect()

    const affectedExerciseIds = [...new Set(workoutExercises.map((we) => we.exerciseId))]

    for (const we of workoutExercises) {
      const sets = await ctx.db
        .query('sets')
        .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
        .collect()
      for (const s of sets) await ctx.db.delete(s._id)
      await ctx.db.delete(we._id)
    }
    await ctx.db.delete(args.workoutId)

    // Claw the points back. Without this, delete-and-relog is a points
    // printer and the "balance == sum of pointsAwarded" invariant the
    // leaderboard rests on stops holding. reconcileWeek re-prices every
    // surviving workout in the week too, since removing day 1 of a three-day
    // week moves days 2 and 3 back down the curve.
    //
    // Scoped to the deleted workout's own week. Deleting the only session of
    // some past week also shortens the streak, which should in principle
    // lower every LATER week's multiplier — recomputing all of them is
    // unbounded, so that drift is accepted. The live leaderboard is
    // unaffected either way; it re-derives the current streak on every read.
    if (workout.endedAt !== undefined) {
      await reconcileWeek(ctx, userId, workout.startedAt, workout.pointsAwarded ?? 0)

      // Mirror of the increment in workouts.finish. Only completed workouts
      // were ever counted, so only completed ones are subtracted. Floored at
      // zero so a profile that predates the backfill can't go negative.
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique()
      if (profile) {
        await ctx.db.patch(profile._id, {
          workoutsCompleted: Math.max(0, (profile.workoutsCompleted ?? 0) - 1),
        })
      }
    }

    // Any feed post about this workout is UNLINKED, not deleted. The post
    // carries its own snapshot of the stats, so it stands on its own — and
    // silently destroying someone's post and its comment thread because they
    // tidied their workout history would be worse than a post whose "view
    // full workout" link is simply absent.
    const posts = await ctx.db
      .query('posts')
      .withIndex('by_workout', (q) => q.eq('workoutId', args.workoutId))
      .collect()
    for (const post of posts) {
      await ctx.db.patch(post._id, { workoutId: undefined })
    }

    for (const exerciseId of affectedExerciseIds) {
      await recomputeRecord(ctx, userId, exerciseId)
    }
  },
})

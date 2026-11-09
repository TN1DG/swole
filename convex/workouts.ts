import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { beatsRecord, epley1rm, utcWeekIndex } from './fitness'
import { assertRange, cleanName, LIMITS } from './validation'
import { reconcileWeek } from './points'
import { notify } from './notifications'
import { requireWriter } from './rateLimiter'
import { getOrCreateProfile } from './profiles'
import { lastPerformance } from './routines'
import { clearNowPlaying, kickSpotifyPoller } from './spotify'

// ---------- shared ownership helpers ----------
// Every mutation walks up to the workout and checks it belongs to the caller.

// Every write in this module funnels through here (directly, or via the
// getOwned* helpers below), so `requireWriter` charges the per-user write
// budget once for each of them without each handler having to remember to.
export async function getOwnedWorkout(ctx: MutationCtx, workoutId: Id<'workouts'>) {
  const userId = await requireWriter(ctx)
  const workout = await ctx.db.get(workoutId)
  if (!workout || workout.ownerId !== userId) throw new Error('Workout not found')
  return { userId, workout }
}

// Same, but also rejects completed workouts — history must stay immutable
// (records are computed at finish time and would silently drift otherwise).
async function getOwnedActiveWorkout(ctx: MutationCtx, workoutId: Id<'workouts'>) {
  const result = await getOwnedWorkout(ctx, workoutId)
  if (result.workout.endedAt !== undefined) {
    throw new Error('Workout is already finished')
  }
  return result
}

async function getOwnedWorkoutExercise(
  ctx: MutationCtx,
  workoutExerciseId: Id<'workoutExercises'>,
) {
  const workoutExercise = await ctx.db.get(workoutExerciseId)
  if (!workoutExercise) throw new Error('Not found')
  const { userId, workout } = await getOwnedActiveWorkout(ctx, workoutExercise.workoutId)
  return { userId, workout, workoutExercise }
}

async function getOwnedSet(ctx: MutationCtx, setId: Id<'sets'>) {
  const set = await ctx.db.get(setId)
  if (!set) throw new Error('Not found')
  const rest = await getOwnedWorkoutExercise(ctx, set.workoutExerciseId)
  return { ...rest, set }
}

async function setsOf(ctx: QueryCtx | MutationCtx, workoutExerciseId: Id<'workoutExercises'>) {
  const sets = await ctx.db
    .query('sets')
    .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', workoutExerciseId))
    .collect()
  return sets.sort((a, b) => a.setNumber - b.setNumber)
}

async function exercisesOf(ctx: QueryCtx | MutationCtx, workoutId: Id<'workouts'>) {
  const workoutExercises = await ctx.db
    .query('workoutExercises')
    .withIndex('by_workout', (q) => q.eq('workoutId', workoutId))
    .collect()
  return workoutExercises.sort((a, b) => a.position - b.position)
}

// ---------- queries ----------

// The in-progress workout (endedAt unset), joined with exercises and sets.
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const workout = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .order('desc')
      .filter((q) => q.eq(q.field('endedAt'), undefined))
      .first()
    if (!workout) return null

    const workoutExercises = await exercisesOf(ctx, workout._id)
    const exercises = await Promise.all(
      workoutExercises.map(async (we) => ({
        workoutExerciseId: we._id,
        position: we.position,
        exercise: (await ctx.db.get(we.exerciseId))!,
        sets: await setsOf(ctx, we._id),
      })),
    )

    return { ...workout, exercises }
  },
})

// ---------- mutations ----------

// Start a workout (no-op if one is already active). The client sends its local
// hour so the default name matches the user's clock, not the server's.
export const start = mutation({
  args: { localHour: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // `start` is the one write here that has no existing row to own, so it
    // charges the budget itself rather than via getOwnedWorkout.
    const userId = await requireWriter(ctx)

    const existing = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .filter((q) => q.eq(q.field('endedAt'), undefined))
      .first()
    if (existing) return existing._id

    // Ration lifetime workout creation. The rate limiter caps how *fast* an
    // account can write; this caps how much it can ever accumulate, which is
    // what actually costs storage. Checked only when a row is really about to
    // be inserted — the early return above means re-opening an active workout
    // is free.
    const profile = await getOrCreateProfile(ctx, userId)
    const startedCount = profile.workoutsStarted ?? 0
    if (startedCount >= LIMITS.workoutsPerUser) {
      throw new ConvexError('Workout limit reached for this account')
    }
    await ctx.db.patch(profile._id, { workoutsStarted: startedCount + 1 })

    const hour =
      args.localHour !== undefined
        ? assertRange(args.localHour, 0, 23, 'localHour')
        : new Date().getUTCHours()
    const name =
      hour < 5 ? 'Night Workout'
      : hour < 12 ? 'Morning Workout'
      : hour < 17 ? 'Afternoon Workout'
      : hour < 21 ? 'Evening Workout'
      : 'Night Workout'

    const workoutId = await ctx.db.insert('workouts', {
      ownerId: userId,
      name,
      startedAt: Date.now(),
    })
    await kickSpotifyPoller(ctx, userId)
    return workoutId
  },
})

export const rename = mutation({
  args: { workoutId: v.id('workouts'), name: v.string() },
  handler: async (ctx, args) => {
    await getOwnedWorkout(ctx, args.workoutId)
    await ctx.db.patch(args.workoutId, { name: cleanName(args.name, 80, 'Workout name') })
  },
})

// Add an exercise to the workout with one empty set ready to fill in.
export const addExercise = mutation({
  args: { workoutId: v.id('workouts'), exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const { userId } = await getOwnedActiveWorkout(ctx, args.workoutId)

    // The exercise must be a built-in or one of the caller's customs.
    const exercise = await ctx.db.get(args.exerciseId)
    if (!exercise || (exercise.ownerId !== undefined && exercise.ownerId !== userId)) {
      throw new Error('Exercise not found')
    }

    const existing = await exercisesOf(ctx, args.workoutId)
    if (existing.length >= LIMITS.exercisesPerWorkout) {
      throw new Error(`Max ${LIMITS.exercisesPerWorkout} exercises per workout`)
    }
    const workoutExerciseId = await ctx.db.insert('workoutExercises', {
      workoutId: args.workoutId,
      exerciseId: args.exerciseId,
      position: existing.length,
    })
    await ctx.db.insert('sets', {
      workoutExerciseId,
      setNumber: 1,
      weightKg: 0,
      reps: 0,
      isWarmup: false,
      completed: false,
    })
    return workoutExerciseId
  },
})

// New set pre-filled from the previous one (usually you repeat the weight).
export const addSet = mutation({
  args: { workoutExerciseId: v.id('workoutExercises') },
  handler: async (ctx, args) => {
    await getOwnedWorkoutExercise(ctx, args.workoutExerciseId)
    const sets = await setsOf(ctx, args.workoutExerciseId)
    if (sets.length >= LIMITS.setsPerExercise) {
      throw new Error(`Max ${LIMITS.setsPerExercise} sets per exercise`)
    }
    const last = sets[sets.length - 1]
    return await ctx.db.insert('sets', {
      workoutExerciseId: args.workoutExerciseId,
      setNumber: (last?.setNumber ?? 0) + 1,
      weightKg: last?.weightKg ?? 0,
      reps: last?.reps ?? 0,
      isWarmup: false,
      completed: false,
    })
  },
})

export const updateSet = mutation({
  args: {
    setId: v.id('sets'),
    weightKg: v.optional(v.number()),
    reps: v.optional(v.number()),
    completed: v.optional(v.boolean()),
    isWarmup: v.optional(v.boolean()),
    toFailure: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await getOwnedSet(ctx, args.setId)
    if (args.isWarmup === true && args.toFailure === true) {
      throw new Error('A set cannot be both a warm-up and to failure')
    }

    const patch: Partial<Doc<'sets'>> = {}
    if (args.weightKg !== undefined) {
      patch.weightKg = assertRange(args.weightKg, 0, LIMITS.weightKg, 'Weight')
    }
    if (args.reps !== undefined) {
      patch.reps = Math.round(assertRange(args.reps, 0, LIMITS.reps, 'Reps'))
      patch.repsEstimated = undefined
    }
    if (args.completed !== undefined) patch.completed = args.completed
    // Warm-up and to-failure are mutually exclusive: turning one on turns the
    // other off.
    if (args.isWarmup !== undefined) {
      patch.isWarmup = args.isWarmup
      if (args.isWarmup) patch.toFailure = undefined
    }
    if (args.toFailure !== undefined) {
      patch.toFailure = args.toFailure || undefined
      if (args.toFailure) patch.isWarmup = false
    }
    await ctx.db.patch(args.setId, patch)
  },
})

export const removeSet = mutation({
  args: { setId: v.id('sets') },
  handler: async (ctx, args) => {
    const { set } = await getOwnedSet(ctx, args.setId)
    await ctx.db.delete(args.setId)
    // Keep set numbers contiguous: 1,2,3…
    const rest = await setsOf(ctx, set.workoutExerciseId)
    for (const s of rest) {
      if (s.setNumber > set.setNumber) {
        await ctx.db.patch(s._id, { setNumber: s.setNumber - 1 })
      }
    }
  },
})

// Swap this exercise's position with its neighbor in the given direction.
// A no-op past either end of the list (nothing to swap with).
export const moveExercise = mutation({
  args: {
    workoutExerciseId: v.id('workoutExercises'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  handler: async (ctx, args) => {
    const { workoutExercise } = await getOwnedWorkoutExercise(ctx, args.workoutExerciseId)
    const ordered = await exercisesOf(ctx, workoutExercise.workoutId)
    const index = ordered.findIndex((we) => we._id === workoutExercise._id)
    const targetIndex = args.direction === 'up' ? index - 1 : index + 1

    // Covers both ends: a negative index and one past the last both read back
    // as undefined, so this replaces the explicit bounds check that used to
    // sit here rather than duplicating it.
    const target = ordered[targetIndex]
    if (!target) return

    await ctx.db.patch(workoutExercise._id, { position: target.position })
    await ctx.db.patch(target._id, { position: workoutExercise.position })
  },
})

export const removeExercise = mutation({
  args: { workoutExerciseId: v.id('workoutExercises') },
  handler: async (ctx, args) => {
    const { workoutExercise } = await getOwnedWorkoutExercise(ctx, args.workoutExerciseId)

    for (const s of await setsOf(ctx, args.workoutExerciseId)) {
      await ctx.db.delete(s._id)
    }
    await ctx.db.delete(args.workoutExerciseId)

    const rest = await exercisesOf(ctx, workoutExercise.workoutId)
    for (const we of rest) {
      if (we.position > workoutExercise.position) {
        await ctx.db.patch(we._id, { position: we.position - 1 })
      }
    }
  },
})

// Abandon the active workout entirely.
export const cancel = mutation({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const { workout } = await getOwnedWorkout(ctx, args.workoutId)
    if (workout.endedAt !== undefined) throw new Error('Workout already finished')

    for (const we of await exercisesOf(ctx, args.workoutId)) {
      for (const s of await setsOf(ctx, we._id)) await ctx.db.delete(s._id)
      await ctx.db.delete(we._id)
    }
    await ctx.db.delete(args.workoutId)
    await clearNowPlaying(ctx, workout.ownerId)
  },
})

// Best guess at the reps of a to-failure set logged without a count: the
// nearest earlier completed set of this exercise in this workout, else any
// later one, else the same position in the last session with this exercise.
// 0 when there's nothing to go on (the set then adds no volume).
export function estimateFailureReps(
  set: Doc<'sets'>,
  completed: Doc<'sets'>[],
  previous: Doc<'sets'>[] | null,
): number {
  const known = completed.filter(
    (s) => s._id !== set._id && !s.isWarmup && s.reps > 0 && !s.repsEstimated,
  )
  const earlier = known.filter((s) => s.setNumber < set.setNumber)
  const nearest = earlier.length > 0 ? earlier[earlier.length - 1] : known[0]
  if (nearest) return nearest.reps

  const past = (previous ?? []).filter((s) => s.reps > 0)
  const index = completed.filter((s) => !s.isWarmup && s.setNumber < set.setNumber).length
  return past[Math.min(index, past.length - 1)]?.reps ?? 0
}

// Finish: discard incomplete sets, update personal records, return a summary.
export const finish = mutation({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const { userId, workout } = await getOwnedWorkout(ctx, args.workoutId)
    if (workout.endedAt !== undefined) throw new Error('Workout already finished')

    const now = Date.now()
    // The session is over either way (finished or discarded), so friends
    // stop seeing what was playing.
    await clearNowPlaying(ctx, userId)
    let totalVolumeKg = 0
    let completedSetCount = 0
    let prCount = 0
    let exerciseCount = 0

    for (const we of await exercisesOf(ctx, args.workoutId)) {
      const sets = await setsOf(ctx, we._id)

      // Sets never marked done don't count — drop them.
      for (const s of sets.filter((s) => !s.completed)) {
        await ctx.db.delete(s._id)
      }
      const completed = sets.filter((s) => s.completed)
      if (completed.length === 0) {
        await ctx.db.delete(we._id)
        continue
      }
      exerciseCount++
      completedSetCount += completed.length

      // To-failure sets logged without reps get an estimate, so they still
      // count toward volume. Done here rather than when the set is ticked so
      // a later edit of an earlier set can't leave a stale guess behind.
      const unrepped = completed.filter((s) => s.toFailure && s.reps === 0)
      if (unrepped.length > 0) {
        const previous = await lastPerformance(ctx, userId, we.exerciseId)
        for (const s of unrepped) {
          const estimate = estimateFailureReps(s, completed, previous)
          if (estimate > 0) {
            s.reps = estimate
            s.repsEstimated = true
            await ctx.db.patch(s._id, { reps: estimate, repsEstimated: true })
          }
        }
      }

      // Warm-ups don't count toward volume or records.
      const working = completed.filter((s) => !s.isWarmup && s.weightKg > 0 && s.reps > 0)
      totalVolumeKg += working.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
      // ...and an estimated rep count is a guess, so it can't set a record.
      const recordable = working.filter((s) => !s.repsEstimated)
      if (recordable.length === 0) continue

      // Best set by weight (ties broken by reps) and best estimated 1RM.
      const bestBy1rm = recordable.reduce((a, b) =>
        epley1rm(b.weightKg, b.reps) > epley1rm(a.weightKg, a.reps) ? b : a,
      )
      const bestByWeight = recordable.reduce((a, b) =>
        b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a,
      )

      // Re-read the record each iteration: the same exercise can appear twice
      // in one workout, and we see our own earlier writes.
      const record = await ctx.db
        .query('personalRecords')
        .withIndex('by_owner_exercise', (q) =>
          q.eq('ownerId', userId).eq('exerciseId', we.exerciseId),
        )
        .unique()

      if (!record) {
        await ctx.db.insert('personalRecords', {
          ownerId: userId,
          exerciseId: we.exerciseId,
          bestWeightKg: bestByWeight.weightKg,
          bestWeightReps: bestByWeight.reps,
          bestEst1rm: epley1rm(bestBy1rm.weightKg, bestBy1rm.reps),
          achievedAt: now,
          workoutId: args.workoutId,
        })
        prCount++
      } else if (beatsRecord(bestByWeight.weightKg, bestByWeight.reps, record) ||
                 beatsRecord(bestBy1rm.weightKg, bestBy1rm.reps, record)) {
        await ctx.db.patch(record._id, {
          bestWeightKg: Math.max(record.bestWeightKg, bestByWeight.weightKg),
          bestWeightReps:
            bestByWeight.weightKg > record.bestWeightKg
              ? bestByWeight.reps
              : record.bestWeightReps,
          bestEst1rm: Math.max(record.bestEst1rm, epley1rm(bestBy1rm.weightKg, bestBy1rm.reps)),
          achievedAt: now,
          workoutId: args.workoutId,
        })
        prCount++
      }
    }

    // Nothing completed at all -> discard the whole workout.
    if (exerciseCount === 0) {
      await ctx.db.delete(args.workoutId)
      return { discarded: true as const }
    }

    // Stamp the scoring fields before anything reads them back — reconcileWeek
    // below re-reads this row through the index.
    await ctx.db.patch(args.workoutId, {
      endedAt: now,
      volumeKg: totalVolumeKg,
      setCount: completedSetCount,
      prCount,
    })

    // This is the moment a workout becomes "completed", so it's the one place
    // the lifetime counter behind profiles.getMine goes up. The
    // exerciseCount === 0 path above returns before here, having deleted the
    // workout outright — a discarded session must not count.
    const ownerProfile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(ownerProfile._id, {
      workoutsCompleted: (ownerProfile.workoutsCompleted ?? 0) + 1,
    })

    // Points are a property of the week the workout STARTED in, not of the
    // moment it was finished: a session begun 23:50 on Sunday and finished
    // 00:30 on Monday belongs to Sunday's week.
    await reconcileWeek(ctx, userId, workout.startedAt)

    // A workout that straddled the week boundary retroactively extends the
    // streak feeding the CURRENT week's multiplier, so that week needs
    // re-settling too. Rare, and one extra ranged read closes the only
    // retroactivity hole in the model.
    if (utcWeekIndex(workout.startedAt) !== utcWeekIndex(now)) {
      await reconcileWeek(ctx, userId, now)
    }

    try {
      const SIX_HOURS = 6 * 60 * 60 * 1000
      const recentPings = await ctx.db
        .query('gymPings')
        .withIndex('by_from', (q) => q.eq('fromUserId', userId))
        .order('desc')
        .collect()
      const target = recentPings.find(
        (p) => p.linkedWorkoutId === undefined && now - p.sentAt <= SIX_HOURS,
      )
      if (target) {
        await ctx.db.patch(target._id, { linkedWorkoutId: args.workoutId })
        // "X won the battle" goes to the friend who held me accountable —
        // only if they actually acknowledged the ping, since the whole point
        // is that they took up the challenge. (The linking above doesn't care
        // about ack state, so this is a deliberately narrower condition.)
        if (target.acknowledgedAt !== undefined) {
          await notify(ctx, {
            userId: target.toUserId,
            kind: 'workout_finished_after_ping',
            fromUserId: userId,
            pingId: target._id,
            workoutId: args.workoutId,
          })
        }
      }
    } catch {
      // best-effort — never block workout completion
    }

    return {
      discarded: false as const,
      workoutId: args.workoutId,
      prCount,
      totalVolumeKg,
      completedSetCount,
      exerciseCount,
      durationMs: now - workout.startedAt,
    }
  },
})

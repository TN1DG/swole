import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { beatsRecord, epley1rm } from './fitness'
import { assertRange, cleanName, LIMITS } from './validation'

// ---------- shared ownership helpers ----------
// Every mutation walks up to the workout and checks it belongs to the caller.

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not signed in')
  return userId
}

async function getOwnedWorkout(ctx: MutationCtx, workoutId: Id<'workouts'>) {
  const userId = await requireUserId(ctx)
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
    const userId = await requireUserId(ctx)

    const existing = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .filter((q) => q.eq(q.field('endedAt'), undefined))
      .first()
    if (existing) return existing._id

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

    return await ctx.db.insert('workouts', {
      ownerId: userId,
      name,
      startedAt: Date.now(),
    })
  },
})

export const rename = mutation({
  args: { workoutId: v.id('workouts'), name: v.string() },
  handler: async (ctx, args) => {
    await getOwnedWorkout(ctx, args.workoutId)
    await ctx.db.patch(args.workoutId, { name: cleanName(args.name) })
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
  },
  handler: async (ctx, args) => {
    await getOwnedSet(ctx, args.setId)

    const patch: Partial<Doc<'sets'>> = {}
    if (args.weightKg !== undefined) {
      patch.weightKg = assertRange(args.weightKg, 0, LIMITS.weightKg, 'Weight')
    }
    if (args.reps !== undefined) {
      patch.reps = Math.round(assertRange(args.reps, 0, LIMITS.reps, 'Reps'))
    }
    if (args.completed !== undefined) patch.completed = args.completed
    if (args.isWarmup !== undefined) patch.isWarmup = args.isWarmup
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
    if (targetIndex < 0 || targetIndex >= ordered.length) return

    const target = ordered[targetIndex]
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
  },
})

// Finish: discard incomplete sets, update personal records, return a summary.
export const finish = mutation({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const { userId, workout } = await getOwnedWorkout(ctx, args.workoutId)
    if (workout.endedAt !== undefined) throw new Error('Workout already finished')

    const now = Date.now()
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

      // Warm-ups don't count toward volume or records.
      const working = completed.filter((s) => !s.isWarmup && s.weightKg > 0 && s.reps > 0)
      totalVolumeKg += working.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
      if (working.length === 0) continue

      // Best set by weight (ties broken by reps) and best estimated 1RM.
      const bestBy1rm = working.reduce((a, b) =>
        epley1rm(b.weightKg, b.reps) > epley1rm(a.weightKg, a.reps) ? b : a,
      )
      const bestByWeight = working.reduce((a, b) =>
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

    await ctx.db.patch(args.workoutId, { endedAt: now })
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

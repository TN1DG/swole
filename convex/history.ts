import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { beatsRecord, epley1rm } from './fitness'

// Working sets = completed, not warm-up, with real weight/reps.
function workingSets(sets: Doc<'sets'>[]) {
  return sets.filter((s) => s.completed && !s.isWarmup && s.weightKg > 0 && s.reps > 0)
}

// ---------- queries ----------

// Completed workouts, newest first, each with summary stats for the list cards.
export const listCompleted = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .order('desc')
      .collect()

    return Promise.all(
      workouts
        .filter((w) => w.endedAt !== undefined)
        .map(async (workout) => {
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
        }),
    )
  },
})

// Full workout detail: every exercise with every set, plus which exercises
// earned a PR in this workout (records still pointing at it).
export const getDetail = query({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const workout = await ctx.db.get(args.workoutId)
    if (!workout || workout.ownerId !== userId) return null

    const workoutExercises = await ctx.db
      .query('workoutExercises')
      .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
      .collect()

    const exercises = await Promise.all(
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

    const records = await ctx.db
      .query('personalRecords')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    const prExerciseIds = records
      .filter((r) => r.workoutId === workout._id)
      .map((r) => r.exerciseId)

    return { ...workout, exercises, prExerciseIds }
  },
})

// Per-exercise progress across completed workouts (for the chart), oldest first.
export const exerciseHistory = query({
  args: { exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()

    const sessions: {
      workoutId: Id<'workouts'>
      startedAt: number
      topWeightKg: number
      topWeightReps: number
      bestE1rm: number
      volumeKg: number
      setCount: number
    }[] = []

    for (const workout of workouts.filter((w) => w.endedAt !== undefined)) {
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
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

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

    for (const exerciseId of affectedExerciseIds) {
      await recomputeRecord(ctx, userId, exerciseId)
    }
  },
})

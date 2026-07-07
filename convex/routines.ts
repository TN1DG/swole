import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { cleanName, LIMITS } from './validation'

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not signed in')
  return userId
}

// Exercises must exist and be visible to the caller (built-in or their own).
async function validateExercises(
  ctx: MutationCtx,
  userId: Id<'users'>,
  entries: { exerciseId: Id<'exercises'>; targetSets: number }[],
) {
  if (entries.length === 0) throw new Error('Add at least one exercise')
  if (entries.length > LIMITS.exercisesPerRoutine) {
    throw new Error(`Max ${LIMITS.exercisesPerRoutine} exercises per routine`)
  }
  for (const entry of entries) {
    const exercise = await ctx.db.get(entry.exerciseId)
    if (!exercise || (exercise.ownerId !== undefined && exercise.ownerId !== userId)) {
      throw new Error('Exercise not found')
    }
  }
}

function cleanNotes(notes: string | undefined) {
  if (notes === undefined) return undefined
  const trimmed = notes.trim().slice(0, LIMITS.noteLength)
  return trimmed || undefined
}

const exercisesArg = v.array(
  v.object({ exerciseId: v.id('exercises'), targetSets: v.number() }),
)

// ---------- queries ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const routines = await ctx.db
      .query('routines')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()

    return Promise.all(
      routines.map(async (routine) => {
        const entries = await ctx.db
          .query('routineExercises')
          .withIndex('by_routine', (q) => q.eq('routineId', routine._id))
          .collect()
        const exercises = await Promise.all(
          entries
            .sort((a, b) => a.position - b.position)
            .map(async (entry) => ({
              exerciseId: entry.exerciseId,
              targetSets: entry.targetSets,
              name: (await ctx.db.get(entry.exerciseId))?.name ?? '?',
            })),
        )
        return { _id: routine._id, name: routine.name, notes: routine.notes, exercises }
      }),
    )
  },
})

// ---------- mutations ----------

export const create = mutation({
  args: { name: v.string(), notes: v.optional(v.string()), exercises: exercisesArg },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const name = cleanName(args.name)
    await validateExercises(ctx, userId, args.exercises)

    const existing = await ctx.db
      .query('routines')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    if (existing.length >= LIMITS.routinesPerUser) {
      throw new Error(`Max ${LIMITS.routinesPerUser} routines`)
    }

    const routineId = await ctx.db.insert('routines', {
      ownerId: userId,
      name,
      notes: cleanNotes(args.notes),
    })
    for (const [position, entry] of args.exercises.entries()) {
      await ctx.db.insert('routineExercises', {
        routineId,
        exerciseId: entry.exerciseId,
        position,
        targetSets: Math.min(10, Math.max(1, Math.round(entry.targetSets))),
      })
    }
    return routineId
  },
})

export const update = mutation({
  args: {
    routineId: v.id('routines'),
    name: v.string(),
    notes: v.optional(v.string()),
    exercises: exercisesArg,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const routine = await ctx.db.get(args.routineId)
    if (!routine || routine.ownerId !== userId) throw new Error('Routine not found')

    const name = cleanName(args.name)
    await validateExercises(ctx, userId, args.exercises)

    await ctx.db.patch(args.routineId, { name, notes: cleanNotes(args.notes) })

    // Replace the exercise list wholesale — simpler than diffing.
    const existing = await ctx.db
      .query('routineExercises')
      .withIndex('by_routine', (q) => q.eq('routineId', args.routineId))
      .collect()
    for (const entry of existing) await ctx.db.delete(entry._id)
    for (const [position, entry] of args.exercises.entries()) {
      await ctx.db.insert('routineExercises', {
        routineId: args.routineId,
        exerciseId: entry.exerciseId,
        position,
        targetSets: Math.min(10, Math.max(1, Math.round(entry.targetSets))),
      })
    }
  },
})

export const remove = mutation({
  args: { routineId: v.id('routines') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const routine = await ctx.db.get(args.routineId)
    if (!routine || routine.ownerId !== userId) throw new Error('Routine not found')

    const entries = await ctx.db
      .query('routineExercises')
      .withIndex('by_routine', (q) => q.eq('routineId', args.routineId))
      .collect()
    for (const entry of entries) await ctx.db.delete(entry._id)
    await ctx.db.delete(args.routineId)
  },
})

// The user's completed sets from the most recent workout containing this
// exercise — used to pre-fill a fresh workout with "numbers to beat".
async function lastPerformance(
  ctx: MutationCtx,
  userId: Id<'users'>,
  exerciseId: Id<'exercises'>,
) {
  const workouts = await ctx.db
    .query('workouts')
    .withIndex('by_owner', (q) => q.eq('ownerId', userId))
    .order('desc')
    .collect()

  // Bound the scan: only look at the 50 most recent completed workouts.
  for (const workout of workouts.filter((w) => w.endedAt !== undefined).slice(0, 50)) {
    const entries = await ctx.db
      .query('workoutExercises')
      .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
      .collect()
    const matching = entries.filter((we) => we.exerciseId === exerciseId)
    if (matching.length === 0) continue

    const sets = (
      await Promise.all(
        matching.map((we) =>
          ctx.db
            .query('sets')
            .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
            .collect(),
        ),
      )
    )
      .flat()
      .filter((s) => s.completed && !s.isWarmup)
      .sort((a, b) => a.setNumber - b.setNumber)
    if (sets.length > 0) return sets
  }
  return null
}

// Start a workout pre-filled from a routine.
export const startFromRoutine = mutation({
  args: { routineId: v.id('routines') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const routine = await ctx.db.get(args.routineId)
    if (!routine || routine.ownerId !== userId) throw new Error('Routine not found')

    const active = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .filter((q) => q.eq(q.field('endedAt'), undefined))
      .first()
    if (active) throw new Error('Finish your current workout first')

    const workoutId = await ctx.db.insert('workouts', {
      ownerId: userId,
      name: routine.name,
      startedAt: Date.now(),
    })

    const entries = await ctx.db
      .query('routineExercises')
      .withIndex('by_routine', (q) => q.eq('routineId', args.routineId))
      .collect()

    for (const entry of entries.sort((a, b) => a.position - b.position)) {
      const workoutExerciseId = await ctx.db.insert('workoutExercises', {
        workoutId,
        exerciseId: entry.exerciseId,
        position: entry.position,
      })

      const previous = await lastPerformance(ctx, userId, entry.exerciseId)
      for (let i = 0; i < entry.targetSets; i++) {
        // Repeat the last session's numbers; extra sets copy its final set.
        const src = previous ? previous[Math.min(i, previous.length - 1)] : null
        await ctx.db.insert('sets', {
          workoutExerciseId,
          setNumber: i + 1,
          weightKg: src?.weightKg ?? 0,
          reps: src?.reps ?? 0,
          isWarmup: false,
          completed: false,
        })
      }
    }
    return workoutId
  },
})

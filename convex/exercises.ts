import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { internalMutation, mutation, query } from './_generated/server'
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from './constants'
import { BUILT_IN_EXERCISES } from './seedData'
import { cleanName, LIMITS } from './validation'

// Both create and update take the same user-supplied fields.
function validateExerciseFields(args: {
  name: string
  muscleGroup: string
  equipment?: string
}) {
  const name = cleanName(args.name)
  if (!(MUSCLE_GROUPS as readonly string[]).includes(args.muscleGroup)) {
    throw new Error('Unknown muscle group')
  }
  if (
    args.equipment !== undefined &&
    !(EQUIPMENT_TYPES as readonly string[]).includes(args.equipment)
  ) {
    throw new Error('Unknown equipment type')
  }
  return { name, muscleGroup: args.muscleGroup, equipment: args.equipment }
}

// All exercises visible to the signed-in user: built-ins + their customs.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const builtIns = await ctx.db
      .query('exercises')
      .withIndex('by_owner', (q) => q.eq('ownerId', undefined))
      .collect()
    const custom = await ctx.db
      .query('exercises')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()

    return [...builtIns, ...custom].sort((a, b) => a.name.localeCompare(b.name))
  },
})

// Add a custom exercise owned by the signed-in user.
export const create = mutation({
  args: {
    name: v.string(),
    muscleGroup: v.string(),
    equipment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const fields = validateExerciseFields(args)

    const existing = await ctx.db
      .query('exercises')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    if (existing.length >= LIMITS.customExercisesPerUser) {
      throw new Error(`Max ${LIMITS.customExercisesPerUser} custom exercises`)
    }

    return await ctx.db.insert('exercises', {
      ownerId: userId,
      ...fields,
      isCustom: true,
    })
  },
})

// Edit a custom exercise. Built-ins and other users' exercises are off-limits.
export const update = mutation({
  args: {
    id: v.id('exercises'),
    name: v.string(),
    muscleGroup: v.string(),
    equipment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const exercise = await ctx.db.get(args.id)
    if (!exercise || exercise.ownerId !== userId) {
      throw new Error('Exercise not found')
    }

    await ctx.db.patch(args.id, validateExerciseFields(args))
  },
})

// One-time seeding of the built-in library (run: npx convex run exercises:seed).
// internalMutation = not callable from the app, only by us/other server code.
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('exercises')
      .withIndex('by_owner', (q) => q.eq('ownerId', undefined))
      .first()
    if (existing) return 'Already seeded — skipped.'

    for (const exercise of BUILT_IN_EXERCISES) {
      await ctx.db.insert('exercises', { ...exercise, isCustom: false })
    }
    return `Seeded ${BUILT_IN_EXERCISES.length} exercises.`
  },
})

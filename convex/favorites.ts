import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query } from './_generated/server'
import { LIMITS } from './validation'

// Exercises visible to a user are built-ins (no owner) plus their own
// customs — anything else is someone else's private exercise.
function assertVisible(
  exercise: { ownerId?: string } | null,
  userId: string,
): asserts exercise is NonNullable<typeof exercise> {
  if (!exercise || (exercise.ownerId !== undefined && exercise.ownerId !== userId)) {
    throw new Error('Exercise not found')
  }
}

// Just the ids, for cheap heart-icon state across a whole exercise list.
export const myFavoriteIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const favorites = await ctx.db
      .query('favorites')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    return favorites.map((f) => f.exerciseId)
  },
})

// Whether one exercise is favorited, for a single detail view.
export const isFavorited = query({
  args: { exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return false

    const existing = await ctx.db
      .query('favorites')
      .withIndex('by_owner_exercise', (q) =>
        q.eq('ownerId', userId).eq('exerciseId', args.exerciseId),
      )
      .unique()
    return existing !== null
  },
})

// Favorited exercises joined with name + PR, newest-favorited first.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const favorites = await ctx.db
      .query('favorites')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()

    const joined = await Promise.all(
      favorites.map(async (fav) => {
        const exercise = await ctx.db.get(fav.exerciseId)
        if (!exercise) return null
        const record = await ctx.db
          .query('personalRecords')
          .withIndex('by_owner_exercise', (q) =>
            q.eq('ownerId', userId).eq('exerciseId', fav.exerciseId),
          )
          .unique()
        return { exercise, record, favoritedAt: fav._creationTime }
      }),
    )

    return joined
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.favoritedAt - a.favoritedAt)
  },
})

// Star/unstar one exercise. Returns the new state.
export const toggle = mutation({
  args: { exerciseId: v.id('exercises') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const exercise = await ctx.db.get(args.exerciseId)
    assertVisible(exercise, userId)

    const existing = await ctx.db
      .query('favorites')
      .withIndex('by_owner_exercise', (q) =>
        q.eq('ownerId', userId).eq('exerciseId', args.exerciseId),
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
      return false
    }

    const count = await ctx.db
      .query('favorites')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    if (count.length >= LIMITS.favoritesPerUser) {
      throw new Error(`Max ${LIMITS.favoritesPerUser} favorites`)
    }

    await ctx.db.insert('favorites', { ownerId: userId, exerciseId: args.exerciseId })
    return true
  },
})

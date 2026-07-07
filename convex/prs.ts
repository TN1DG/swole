import { getAuthUserId } from '@convex-dev/auth/server'
import { query } from './_generated/server'

// All of the caller's personal records, joined with exercise names.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const records = await ctx.db
      .query('personalRecords')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()

    return Promise.all(
      records.map(async (record) => ({
        ...record,
        exercise: await ctx.db.get(record.exerciseId),
      })),
    )
  },
})

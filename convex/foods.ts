import { getAuthUserId } from '@convex-dev/auth/server'
import { internalMutation, query } from './_generated/server'
import { SEED_FOODS } from './foodSeedData'

// The reference food database for the Nutrition page's search-to-log picker
// (src/features/nutrition/FoodPicker.tsx) — a free alternative to the AI
// photo-estimate path (nutrition.ts:analyzeFoodPhoto) for common foods.
// Same "auth-gated but not owner-scoped" shape as exercises.ts:list: the data
// itself isn't private, but nothing in this app answers queries for a
// signed-out caller.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    return await ctx.db.query('foodDatabase').collect()
  },
})

// One-time seeding of the food database (run: npx convex run foods:seed).
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('foodDatabase').first()
    if (existing) return 'Already seeded — skipped.'

    for (const food of SEED_FOODS) {
      await ctx.db.insert('foodDatabase', food)
    }
    return `Seeded ${SEED_FOODS.length} foods.`
  },
})

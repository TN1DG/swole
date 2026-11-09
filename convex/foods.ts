import { getAuthUserId } from '@convex-dev/auth/server'
import { internalMutation, query } from './_generated/server'
import { SEED_FOODS, type SeedFood } from './foodSeedData'
import { REGIONAL_SEED_FOODS } from './foodSeedRegional'
import { INDIAN_SEED_FOODS } from './foodSeedIndian'

// Every food the database should contain. The original list first, then the
// regional additions (see my_data_sets/regional/SOURCES.md), which the
// generator has already de-duplicated against it.
export const ALL_SEED_FOODS: SeedFood[] = [...SEED_FOODS, ...REGIONAL_SEED_FOODS, ...INDIAN_SEED_FOODS]

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

// Seeds the food database: inserts every seed food whose name isn't already
// there (run: npx convex run foods:seed). Additive rather than all-or-nothing,
// so a deployment seeded before a batch of new foods was added picks them up
// on the next run instead of skipping because the table isn't empty. Never
// updates or deletes rows: foodLogs.foodId points at them.
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // A few thousand small rows, well inside one transaction's read limit.
    const existing = new Set((await ctx.db.query('foodDatabase').collect()).map((f) => f.name))
    const missing = ALL_SEED_FOODS.filter((f) => !existing.has(f.name))
    if (missing.length === 0) return 'Already seeded — skipped.'

    for (const food of missing) {
      await ctx.db.insert('foodDatabase', food)
    }
    return `Seeded ${missing.length} foods.`
  },
})

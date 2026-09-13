import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'

// Runs every one-time seed in one shot. `--preview-run` (scripts/vercel-build.js)
// only accepts a single function name, so a fresh preview deployment needs one
// entry point that seeds everything a first-run deployment is missing, rather
// than one flag per table. Each seed mutation is already idempotent on its
// own, so this stays safe to call again (e.g. after adding a new seed here).
export const seedAll = internalMutation({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    return [
      await ctx.runMutation(internal.exercises.seed, {}),
      await ctx.runMutation(internal.foods.seed, {}),
    ]
  },
})

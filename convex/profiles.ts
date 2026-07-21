import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

// No profile row exists until the user first sets something (display name or
// unit preference) — create one on demand instead of on every sign-up.
async function getOrCreateProfile(ctx: MutationCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (existing) return existing

  const id = await ctx.db.insert('profiles', { userId, unitPreference: 'kg' })
  return (await ctx.db.get(id))!
}

// Everything the profile screen shows: identity, and a few cheap lifetime
// counts (not the heavier "total volume ever" — that would mean scanning
// every set of every workout just to render a number).
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const user = await ctx.db.get(userId)
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()

    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    const [prs, favorites] = await Promise.all([
      ctx.db
        .query('personalRecords')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .collect(),
      ctx.db
        .query('favorites')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .collect(),
    ])

    return {
      email: user?.email ?? null,
      displayName: profile?.displayName ?? null,
      unitPreference: profile?.unitPreference ?? 'kg',
      memberSince: user?._creationTime ?? Date.now(),
      workoutCount: workouts.filter((w) => w.endedAt !== undefined).length,
      prCount: prs.length,
      favoriteCount: favorites.length,
    }
  },
})

// Empty string clears it (falls back to showing the email instead).
export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const trimmed = args.displayName.trim()
    if (trimmed.length > 40) throw new Error('Name too long (max 40 characters)')

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { displayName: trimmed || undefined })
  },
})

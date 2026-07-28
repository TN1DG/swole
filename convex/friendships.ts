import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

// Friendship is stored one row per direction (see convex/schema.ts), so a
// membership check is a single index read.
//
// This lives in its own module rather than being copied per domain file:
// friends.ts, pings.ts, challenges.ts and messages.ts all gate on it, and by
// the fourth byte-identical copy the "each domain file keeps its own"
// convention was costing more than it saved. There are no Convex functions in
// here — it's a plain helper module, so nothing is exposed to clients.
export async function areFriends(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  otherId: Id<'users'>,
): Promise<boolean> {
  const row = await ctx.db
    .query('friendships')
    .withIndex('by_user_friend', (q) => q.eq('userId', userId).eq('friendId', otherId))
    .unique()
  return row !== null
}

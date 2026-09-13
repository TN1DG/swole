import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { cleanText, LIMITS } from './validation'
import { rateLimiter } from './rateLimiter'
import { areFriends } from './friendships'

// How many messages the thread ever loads. The unified thread trims again
// across all entry types (see friendThread.ts); this just bounds the read.
const THREAD_LIMIT = 100


// Both directions of a conversation, oldest first. A plain exported helper
// rather than a query so friendThread.ts can fold it into the unified thread
// without a nested ctx.runQuery — everything is already inside one
// transaction, so a direct call is both cheaper and simpler.
export async function messagesBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
) {
  const [sent, received] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', friendId))
      .order('desc')
      .take(THREAD_LIMIT),
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
      .order('desc')
      .take(THREAD_LIMIT),
  ])
  return [...sent, ...received].sort((a, b) => a.sentAt - b.sentAt)
}

// The most recent thing this friend sent me, for the unread check. Cheaper
// than loading the whole thread just to look at its last entry.
export async function latestIncomingMessageAt(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
): Promise<number> {
  const latest = await ctx.db
    .query('messages')
    .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
    .order('desc')
    .first()
  return latest?.sentAt ?? 0
}

// Whichever of us sent the most recent message, in either direction — for
// the Friends-list activity preview. Two indexed point lookups (cheap, same
// shape as latestIncomingMessageAt) rather than loading the whole thread.
export async function latestMessageBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
): Promise<{ ts: number; isMine: boolean; text: string } | null> {
  const [mine, theirs] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', friendId))
      .order('desc')
      .first(),
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
      .order('desc')
      .first(),
  ])
  const latest = [mine, theirs]
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.sentAt - a.sentAt)[0]
  if (!latest) return null
  return { ts: latest.sentAt, isMine: latest.fromUserId === userId, text: latest.text }
}

export const send = mutation({
  args: { toUserId: v.id('users'), text: v.string() },
  handler: async (ctx, args) => {
    const fromUserId = await getAuthUserId(ctx)
    if (fromUserId === null) throw new Error('Not signed in')
    await rateLimiter.limit(ctx, 'messageSend', { key: fromUserId, throws: true })

    if (fromUserId === args.toUserId) throw new Error("You can't message yourself")
    if (!(await areFriends(ctx, fromUserId, args.toUserId))) {
      throw new Error('You can only message friends')
    }

    const text = cleanText(args.text, LIMITS.messageMaxLength, 'Message')

    // No notification is raised for chat — the per-thread unread badge on the
    // Friends list covers this, and one banner per incoming message would
    // bury everything else.
    await ctx.db.insert('messages', {
      fromUserId,
      toUserId: args.toUserId,
      text,
      sentAt: Date.now(),
    })
  },
})

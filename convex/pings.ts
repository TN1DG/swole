import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { rateLimiter, requireWriter } from './rateLimiter'
import { markHandled, notify } from './notifications'
import { areFriends } from './friendships'

// Mutation-only: every write in this module goes through here, so it is the
// single place to charge the per-user write budget. Queries in this file call
// `getAuthUserId` directly — the limiter writes, so a query cannot consume it.
async function requireUserId(ctx: MutationCtx) {
  return await requireWriter(ctx)
}

const DAY_MS = 24 * 60 * 60 * 1000

export const send = mutation({
  args: { toUserId: v.id('users') },
  handler: async (ctx, args) => {
    const fromUserId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'pingSend', { key: fromUserId, throws: true })
    if (fromUserId === args.toUserId) throw new Error("Can't ping yourself")

    if (!(await areFriends(ctx, fromUserId, args.toUserId))) {
      throw new Error('You can only ping friends')
    }

    const existing = await ctx.db
      .query('gymPings')
      .withIndex('by_from_to', (q) =>
        q.eq('fromUserId', fromUserId).eq('toUserId', args.toUserId),
      )
      .collect()
    if (existing.some((p) => p.acknowledgedAt === undefined)) {
      throw new ConvexError('You already have a pending ping')
    }

    const pingId = await ctx.db.insert('gymPings', {
      fromUserId,
      toUserId: args.toUserId,
      sentAt: Date.now(),
    })
    await notify(ctx, {
      userId: args.toUserId,
      kind: 'ping_received',
      fromUserId,
      pingId,
    })
  },
})

export const acknowledge = mutation({
  args: { pingId: v.id('gymPings') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const ping = await ctx.db.get(args.pingId)
    if (!ping) throw new Error('Ping not found')
    if (ping.toUserId !== userId) throw new Error('Not authorized')
    if (ping.acknowledgedAt !== undefined) return
    await ctx.db.patch(args.pingId, { acknowledgedAt: Date.now() })
    // Acknowledging from the chat thread should retire the banner too.
    await markHandled(ctx, userId, 'ping_received', ping.fromUserId)
  },
})

// Both directions of a ping thread, oldest first, with the linked workout
// hydrated. A plain exported helper rather than a query so friendThread.ts
// can fold pings into the unified thread without a nested ctx.runQuery —
// it's all one transaction already, so a direct call is cheaper and keeps
// the permission checks in one place.
export async function pingsBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
) {
  const [sentPings, receivedPings] = await Promise.all([
    ctx.db
      .query('gymPings')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', friendId))
      .collect(),
    ctx.db
      .query('gymPings')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
      .collect(),
  ])

  const all = [...sentPings, ...receivedPings].sort((a, b) => a.sentAt - b.sentAt).slice(-20)

  return Promise.all(
    all.map(async (p) => {
      const linkedWorkout = p.linkedWorkoutId ? await ctx.db.get(p.linkedWorkoutId) : null
      return {
        _id: p._id,
        fromUserId: p.fromUserId,
        toUserId: p.toUserId,
        sentAt: p.sentAt,
        acknowledgedAt: p.acknowledgedAt ?? null,
        linkedWorkout: linkedWorkout
          ? { _id: linkedWorkout._id, name: linkedWorkout.name }
          : null,
        isMine: p.fromUserId === userId,
      }
    }),
  )
}

// The most recent ping this friend sent me, for the unread check.
export async function latestIncomingPingAt(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
): Promise<number> {
  const latest = await ctx.db
    .query('gymPings')
    .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
    .order('desc')
    .first()
  return latest?.sentAt ?? 0
}

export const getThread = query({
  args: { friendUserId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    return await pingsBetween(ctx, userId, args.friendUserId)
  },
})

// The single most-relevant "your friend held you accountable" prompt for the
// caller, or null. Shown only while it's still actionable: I sent it, they
// acked it, I haven't dismissed it, it hasn't gone stale (same 24h window
// getThread's chat bubbles fade at), and I haven't already logged a workout
// linked back to it (workouts.finish sets linkedWorkoutId — see
// convex/workouts.ts — a same-session proxy for "already worked out since").
export const getAckPrompt = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const now = Date.now()
    const sent = await ctx.db
      .query('gymPings')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .order('desc')
      .collect()

    const candidate = sent.find(
      (p) =>
        p.acknowledgedAt !== undefined &&
        p.senderPromptDismissedAt === undefined &&
        p.linkedWorkoutId === undefined &&
        now - p.sentAt <= DAY_MS,
    )
    if (!candidate) return null

    return { pingId: candidate._id, toUserId: candidate.toUserId, sentAt: candidate.sentAt }
  },
})

export const dismissPrompt = mutation({
  args: { pingId: v.id('gymPings') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const ping = await ctx.db.get(args.pingId)
    if (!ping) throw new Error('Ping not found')
    if (ping.fromUserId !== userId) throw new Error('Not authorized')
    if (ping.senderPromptDismissedAt !== undefined) return
    await ctx.db.patch(args.pingId, { senderPromptDismissedAt: Date.now() })
  },
})

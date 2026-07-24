import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not signed in')
  return userId
}

async function areFriends(ctx: QueryCtx | MutationCtx, userId: Id<'users'>, otherId: Id<'users'>) {
  const row = await ctx.db
    .query('friendships')
    .withIndex('by_user_friend', (q) => q.eq('userId', userId).eq('friendId', otherId))
    .unique()
  return row !== null
}

export const send = mutation({
  args: { toUserId: v.id('users') },
  handler: async (ctx, args) => {
    const fromUserId = await requireUserId(ctx)
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
      throw new Error('You already have a pending ping')
    }

    await ctx.db.insert('gymPings', {
      fromUserId,
      toUserId: args.toUserId,
      sentAt: Date.now(),
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
  },
})

export const getThread = query({
  args: { friendUserId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const [sentPings, receivedPings] = await Promise.all([
      ctx.db
        .query('gymPings')
        .withIndex('by_from_to', (q) =>
          q.eq('fromUserId', userId).eq('toUserId', args.friendUserId),
        )
        .collect(),
      ctx.db
        .query('gymPings')
        .withIndex('by_from_to', (q) =>
          q.eq('fromUserId', args.friendUserId).eq('toUserId', userId),
        )
        .collect(),
    ])

    const all = [...sentPings, ...receivedPings]
      .sort((a, b) => a.sentAt - b.sentAt)
      .slice(-20)

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
  },
})

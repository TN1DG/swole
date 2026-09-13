import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query } from './_generated/server'
import { requireWriter } from './rateLimiter'
import type { Id } from './_generated/dataModel'
import { latestIncomingMessageAt, latestMessageBetween, messagesBetween } from './messages'
import { latestIncomingPingAt, latestPingBetween, pingsBetween } from './pings'
import { challengesBetween, myChallengesRaw, pickLatestChallenge } from './challenges'

// Newest N entries across all three kinds. Each source is already bounded on
// its own; this caps the merged result the client renders.
const THREAD_ENTRIES = 60

// No friendship gate on reads here: every source query is scoped to the
// (me, them) pair, so a non-friend simply gets an empty thread. Writing
// (messages.send, pings.send, challenges.propose) is where the gate lives.

/**
 * One chronological thread mixing chat messages, gym pings, and challenge
 * status — the three things that happen between two friends.
 *
 * Challenges appear as a SINGLE entry showing their current status, not one
 * entry per propose/accept/resolve transition (there's no event log to build
 * that from). The entry is positioned at the most recent thing that happened
 * to it — `resolvedAt ?? startedAt ?? createdAt` — so an open or just-decided
 * challenge naturally sits near the bottom of the thread where it'll be seen,
 * rather than buried at the point it was first proposed.
 */
export const getThread = query({
  args: { friendUserId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const [messages, pings, challenges] = await Promise.all([
      messagesBetween(ctx, userId, args.friendUserId),
      pingsBetween(ctx, userId, args.friendUserId),
      challengesBetween(ctx, userId, args.friendUserId),
    ])

    const entries = [
      ...messages.map((m) => ({
        type: 'message' as const,
        key: m._id as string,
        ts: m.sentAt,
        isMine: m.fromUserId === userId,
        message: { text: m.text },
      })),
      ...pings.map((p) => ({
        type: 'ping' as const,
        key: p._id as string,
        ts: p.sentAt,
        isMine: p.isMine,
        ping: p,
      })),
      ...challenges.map((c) => ({
        type: 'challenge' as const,
        key: c._id as string,
        ts: c.resolvedAt ?? c.startedAt ?? c.createdAt,
        isMine: c.isMine,
        challenge: c,
      })),
    ]

    return entries.sort((a, b) => a.ts - b.ts).slice(-THREAD_ENTRIES)
  },
})

// Marks this friend's thread read up to now. Called when the chat page opens.
export const markRead = mutation({
  args: { friendUserId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const existing = await ctx.db
      .query('threadReads')
      .withIndex('by_user_friend', (q) =>
        q.eq('userId', userId).eq('friendId', args.friendUserId),
      )
      .unique()

    const lastReadAt = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt })
    } else {
      await ctx.db.insert('threadReads', { userId, friendId: args.friendUserId, lastReadAt })
    }
  },
})

/**
 * Which friends have something new since I last opened their thread.
 *
 * Deliberately a separate query rather than extra fields on
 * friends.myFriends: myFriends is also loaded by the chat page (for the
 * header) and by other views that don't care about unread state, and making
 * it three extra reads per friend would slow all of them down for one
 * screen's benefit.
 */
export const unreadFriendIds = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    const flags = await Promise.all(
      friendships.map(async (f) => {
        const [lastMessageAt, lastPingAt, read] = await Promise.all([
          latestIncomingMessageAt(ctx, userId, f.friendId),
          latestIncomingPingAt(ctx, userId, f.friendId),
          ctx.db
            .query('threadReads')
            .withIndex('by_user_friend', (q) =>
              q.eq('userId', userId).eq('friendId', f.friendId),
            )
            .unique(),
        ])
        const latestIncoming = Math.max(lastMessageAt, lastPingAt)
        const unread = latestIncoming > (read?.lastReadAt ?? 0)
        return unread ? f.friendId : null
      }),
    )

    return flags.filter((id): id is Id<'users'> => id !== null)
  },
})

/**
 * The single most recent thing that happened between me and each friend —
 * a message, a ping, or a challenge update, whichever is newest — for the
 * one-line activity preview under a friend's name on the Friends list.
 *
 * Deliberately separate from myFriends for the same reason as
 * unreadFriendIds: myFriends is loaded by screens that don't need this.
 *
 * Cheap by construction: the message/ping lookups are two indexed point
 * reads each (see latestMessageBetween/latestPingBetween), and the
 * challenge fetch is hoisted out of the per-friend loop — myChallengesRaw
 * runs once for the caller, then pickLatestChallenge filters/ranks it in
 * memory per friend for free, rather than re-querying per friend the way a
 * naive "latest challenge between" helper would.
 */
export const lastActivity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    const myChallenges = await myChallengesRaw(ctx, userId)

    const entries = await Promise.all(
      friendships.map(async (f) => {
        const [message, ping] = await Promise.all([
          latestMessageBetween(ctx, userId, f.friendId),
          latestPingBetween(ctx, userId, f.friendId),
        ])
        const challenge = pickLatestChallenge(myChallenges, userId, f.friendId)

        const candidates = [
          message && { ...message, kind: 'message' as const },
          ping && { ...ping, kind: 'ping' as const },
          challenge && { ...challenge, kind: 'challenge' as const },
        ].filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined)

        if (candidates.length === 0) return null
        const latest = candidates.sort((a, b) => b.ts - a.ts)[0]!
        return { friendId: f.friendId, ...latest }
      }),
    )

    return entries.filter((e): e is NonNullable<typeof e> => e !== null)
  },
})

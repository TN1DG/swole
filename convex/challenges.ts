import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { assertRange, LIMITS } from './validation'
import { forwardStreakWeeks } from './fitness'
import { awardPoints, escrowPoints } from './profiles'
import { rateLimiter, requireWriter } from './rateLimiter'
import { areFriends } from './friendships'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Mutation-only: every write in this module goes through here, so it is the
// single place to charge the per-user write budget. Queries in this file call
// `getAuthUserId` directly — the limiter writes, so a query cannot consume it.
async function requireUserId(ctx: MutationCtx) {
  return await requireWriter(ctx)
}


// Every challenge I'm a party to (either side), unfiltered — the shared fetch
// behind both openChallengeBetween and challengesBetween, and (via
// pickLatestChallenge) the Friends-list activity preview. Callers filter/rank
// in memory rather than each re-querying, since userId is fixed per request.
export async function myChallengesRaw(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'challenges'>[]> {
  const [asChallenger, asOpponent] = await Promise.all([
    ctx.db.query('challenges').withIndex('by_challenger', (q) => q.eq('challengerId', userId)).collect(),
    ctx.db.query('challenges').withIndex('by_opponent', (q) => q.eq('opponentId', userId)).collect(),
  ])
  return [...asChallenger, ...asOpponent]
}

// One open (pending or active) challenge per friend pair at a time — keeps a
// balance meaning "what's actually spendable right now" without needing to
// sum multiple simultaneous escrows against the same friend.
async function openChallengeBetween(
  ctx: QueryCtx | MutationCtx,
  a: Id<'users'>,
  b: Id<'users'>,
) {
  const mine = await myChallengesRaw(ctx, a)
  return mine.find(
    (c) =>
      (c.opponentId === b || c.challengerId === b) &&
      (c.status === 'pending' || c.status === 'active'),
  )
}

// Pure — no ctx, no DB reads. Picks the most recently-relevant challenge
// between `userId` and `friendId` out of an already-fetched batch (see
// myChallengesRaw), for the Friends-list activity preview. Ranked the same
// way friendThread.ts positions a challenge in the unified thread —
// resolvedAt ?? startedAt ?? createdAt — and deliberately skips the live
// forwardStreakWeeks computation challengesBetween does: a one-line preview
// doesn't need it, and it's the expensive part of that helper.
export function pickLatestChallenge(
  all: Doc<'challenges'>[],
  userId: Id<'users'>,
  friendId: Id<'users'>,
): {
  ts: number
  isMine: boolean
  status: Doc<'challenges'>['status']
  outcome: 'won' | 'lost' | 'tied' | null
} | null {
  const candidates = all
    .filter((c) => c.challengerId === friendId || c.opponentId === friendId)
    .map((c) => ({ c, ts: c.resolvedAt ?? c.startedAt ?? c.createdAt }))
    .sort((a, b) => b.ts - a.ts)
  if (candidates.length === 0) return null

  const { c, ts } = candidates[0]!
  const isMine = c.challengerId === userId
  let outcome: 'won' | 'lost' | 'tied' | null = null
  if (c.status === 'resolved') {
    outcome = c.winnerId === undefined ? 'tied' : c.winnerId === userId ? 'won' : 'lost'
  }
  return { ts, isMine, status: c.status, outcome }
}

async function workoutStartedAts(ctx: QueryCtx | MutationCtx, ownerId: Id<'users'>) {
  const workouts = await ctx.db
    .query('workouts')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .filter((q) => q.neq(q.field('endedAt'), undefined))
    .collect()
  return workouts.map((w) => w.startedAt)
}

export const propose = mutation({
  args: { opponentId: v.id('users'), weeks: v.number(), wagerPoints: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'challengePropose', { key: userId, throws: true })
    if (userId === args.opponentId) throw new Error("Can't challenge yourself")
    if (!(await areFriends(ctx, userId, args.opponentId))) {
      throw new Error('You can only challenge friends')
    }
    if (await openChallengeBetween(ctx, userId, args.opponentId)) {
      throw new ConvexError('Already have an open challenge with this friend')
    }

    const weeks = Math.round(
      assertRange(args.weeks, LIMITS.challengeMinWeeks, LIMITS.challengeMaxWeeks, 'Challenge length'),
    )
    const wagerPoints = Math.round(assertRange(args.wagerPoints, 1, LIMITS.maxWagerPoints, 'Wager'))

    await escrowPoints(ctx, userId, wagerPoints)
    return await ctx.db.insert('challenges', {
      challengerId: userId,
      opponentId: args.opponentId,
      status: 'pending',
      weeks,
      wagerPoints,
      createdAt: Date.now(),
    })
  },
})

export const accept = mutation({
  args: { challengeId: v.id('challenges') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const challenge = await ctx.db.get(args.challengeId)
    if (!challenge || challenge.opponentId !== userId) throw new Error('Not found')
    if (challenge.status !== 'pending') throw new Error('No longer pending')

    await escrowPoints(ctx, userId, challenge.wagerPoints)
    const startedAt = Date.now()
    await ctx.db.patch(args.challengeId, {
      status: 'active',
      startedAt,
      endsAt: startedAt + challenge.weeks * WEEK_MS,
    })
  },
})

export const decline = mutation({
  args: { challengeId: v.id('challenges') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const challenge = await ctx.db.get(args.challengeId)
    if (!challenge || challenge.opponentId !== userId) throw new Error('Not found')
    if (challenge.status !== 'pending') throw new Error('No longer pending')

    await awardPoints(ctx, challenge.challengerId, challenge.wagerPoints) // refund escrow
    await ctx.db.patch(args.challengeId, { status: 'declined', resolvedAt: Date.now() })
  },
})

export const cancel = mutation({
  args: { challengeId: v.id('challenges') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const challenge = await ctx.db.get(args.challengeId)
    if (!challenge || challenge.challengerId !== userId) throw new Error('Not found')
    if (challenge.status !== 'pending') throw new Error('Can only cancel a pending challenge')

    await awardPoints(ctx, challenge.challengerId, challenge.wagerPoints) // refund escrow
    await ctx.db.patch(args.challengeId, { status: 'cancelled', resolvedAt: Date.now() })
  },
})

// Challenges between two people, newest first, each with a *live*
// (unpersisted) streak so an in-progress challenge can show real standings
// before the cron resolves it. A plain exported helper rather than a query so
// friendThread.ts can fold challenges into the unified thread without a
// nested ctx.runQuery.
export async function challengesBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
) {
  const mine = await myChallengesRaw(ctx, userId)

  const all = mine
    .filter((c) => c.challengerId === friendId || c.opponentId === friendId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)

  const now = Date.now()
  return Promise.all(
    all.map(async (c: Doc<'challenges'>) => {
      let liveChallengerStreak = c.challengerStreakWeeks
      let liveOpponentStreak = c.opponentStreakWeeks
      if (c.status === 'active' && c.startedAt !== undefined && c.endsAt !== undefined) {
        const [challengerAts, opponentAts] = await Promise.all([
          workoutStartedAts(ctx, c.challengerId),
          workoutStartedAts(ctx, c.opponentId),
        ])
        liveChallengerStreak = forwardStreakWeeks(challengerAts, c.startedAt, c.endsAt, now)
        liveOpponentStreak = forwardStreakWeeks(opponentAts, c.startedAt, c.endsAt, now)
      }
      return { ...c, isMine: c.challengerId === userId, liveChallengerStreak, liveOpponentStreak }
    }),
  )
}

export const getThread = query({
  args: { friendUserId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    return await challengesBetween(ctx, userId, args.friendUserId)
  },
})

// Cron-only (see convex/crons.ts): settle every 'active' challenge whose
// window has ended. Winner takes both wagers; an exact tie refunds each side
// its own wager.
export const resolveExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query('challenges')
      .withIndex('by_status_endsAt', (q) => q.eq('status', 'active').lte('endsAt', now))
      .collect()

    for (const c of due) {
      const [challengerAts, opponentAts] = await Promise.all([
        workoutStartedAts(ctx, c.challengerId),
        workoutStartedAts(ctx, c.opponentId),
      ])
      const challengerStreak = forwardStreakWeeks(challengerAts, c.startedAt!, c.endsAt!, now)
      const opponentStreak = forwardStreakWeeks(opponentAts, c.startedAt!, c.endsAt!, now)

      let winnerId: Id<'users'> | undefined
      if (challengerStreak > opponentStreak) {
        winnerId = c.challengerId
        await awardPoints(ctx, c.challengerId, c.wagerPoints * 2)
      } else if (opponentStreak > challengerStreak) {
        winnerId = c.opponentId
        await awardPoints(ctx, c.opponentId, c.wagerPoints * 2)
      } else {
        await awardPoints(ctx, c.challengerId, c.wagerPoints)
        await awardPoints(ctx, c.opponentId, c.wagerPoints)
      }

      await ctx.db.patch(c._id, {
        status: 'resolved',
        resolvedAt: now,
        winnerId,
        challengerStreakWeeks: challengerStreak,
        opponentStreakWeeks: opponentStreak,
      })
    }
  },
})

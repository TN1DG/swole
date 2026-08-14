import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { eligibleRecordsFor, getWorkoutExercises, summarizeWorkout } from './history'
import {
  consistencyTier,
  displayStreakWeeks,
  utcMonthEnd,
  utcMonthStart,
  utcWeekEnd,
  utcWeekIndex,
  utcWeekStart,
  WEEK_MS,
} from './fitness'
import {
  finishedWorkoutsBetween,
  SCORING_LOOKBACK_WEEKS,
  summarizePeriod,
  trainedWeekSet,
} from './points'
import { cleanUsername, LIMITS } from './validation'
import { consumeUsernameLookup, rateLimiter, requireWriter } from './rateLimiter'
import { markHandled, notify } from './notifications'
import { areFriends } from './friendships'

// Mutation-only: every write in this module goes through here, so it is the
// single place to charge the per-user write budget. Queries in this file call
// `getAuthUserId` directly — the limiter writes, so a query cannot consume it.
async function requireUserId(ctx: MutationCtx) {
  return await requireWriter(ctx)
}

// The profile row behind a user's public identity. The leaderboard and
// friends list call this once per friend, so anything read here is read
// once per row of those lists.
//
// It deliberately does NOT read the `users` document. It used to, for a
// `?? user.email` fallback on displayName — which leaked email addresses:
// `resolveUsername` lets anyone look up any username, and `myOutgoingRequests`
// covers people who are not friends and never accepted anything. A profile
// with a username but no display name is reachable (`setUsername` is its own
// public mutation and doesn't set one), so that fallback published the
// account's email to a stranger. An email is never a display name — falling
// back to the username, then a neutral placeholder, is both safe and better
// UX. Dropping the read also removes one database round-trip per friend.
async function identityOf(ctx: QueryCtx, userId: Id<'users'>) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  return {
    profile,
    info: {
      userId,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? profile?.username ?? 'Someone',
    },
  }
}

async function profileFor(ctx: QueryCtx, userId: Id<'users'>) {
  return (await identityOf(ctx, userId)).info
}

// profileFor + the avatar image URL. Deliberately a separate helper rather
// than folding avatarUrl into profileFor itself: profileFor also backs
// resolveUsername, and adding it there would hand a stranger's photo to
// anyone who guesses their username. Only paths that have already
// established a friendship (or public opt-in) use this one.
async function profileForWithAvatar(ctx: QueryCtx, userId: Id<'users'>) {
  const { profile, info } = await identityOf(ctx, userId)
  return {
    ...info,
    avatarUrl: profile?.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null,
  }
}


// Streak/tier for one specific owner, e.g. showing "whose workout is this" on
// a friend's workout detail. Bounded to the scoring lookback rather than
// reading their whole history — a streak longer than that renders as capped.
async function ownerConsistency(ctx: QueryCtx, ownerId: Id<'users'>, now: number) {
  const history = await finishedWorkoutsBetween(
    ctx,
    ownerId,
    utcWeekStart(now) - SCORING_LOOKBACK_WEEKS * WEEK_MS,
    utcWeekEnd(now),
  )
  const streakWeeks = displayStreakWeeks(trainedWeekSet(history), utcWeekIndex(now))
  return { streakWeeks, tier: consistencyTier(streakWeeks) }
}

// ---------- queries ----------

// Resolve a username to a userId — identity only, no workout data: the
// friend-search box uses this to find who to add or view, and friendWorkouts
// does its own permission check once you get there.
//
// A `mutation` despite reading nothing but identity, and despite sitting under
// the "queries" heading in spirit. It answers "does this username exist", so
// left unthrottled it enumerates the user base as fast as the network allows —
// and throttling requires consuming a rate limit, which writes, which a Convex
// query cannot do. Reactivity is the price: the search box now holds its
// result in component state instead of resubscribing. That costs almost
// nothing here, because the box already only searched on submit.
export const resolveUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await consumeUsernameLookup(ctx, userId)

    const username = args.username.trim().toLowerCase()
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!profile) return null

    return { ...(await profileFor(ctx, profile.userId)), isMe: profile.userId === userId }
  },
})

export const myIncomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const requests = await ctx.db
      .query('friendRequests')
      .withIndex('by_to', (q) => q.eq('toUserId', userId))
      .collect()
    return Promise.all(
      requests.map(async (r) => ({
        requestId: r._id,
        // Avatar is fine here: the sender chose to reveal themselves by
        // requesting you, and you need to recognise who's asking. Note the
        // asymmetry with myOutgoingRequests below — do not "make them
        // consistent" without reading that comment.
        from: await profileForWithAvatar(ctx, r.fromUserId),
      })),
    )
  },
})

export const myOutgoingRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const requests = await ctx.db
      .query('friendRequests')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .collect()
    return Promise.all(
      requests.map(async (r) => ({
        requestId: r._id,
        // Deliberately plain `profileFor` — NOT the avatar variant. The
        // recipient here has not consented to anything: usernames are
        // resolvable by anyone (`resolveUsername`), so if this returned an
        // avatar, you could harvest any user's photo just by looking them up
        // and firing off a request they never accept. That's precisely the
        // leak `profileForWithAvatar`'s own comment warns about.
        to: await profileFor(ctx, r.toUserId),
      })),
    )
  },
})

export const myFriends = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    return Promise.all(friendships.map((f) => profileForWithAvatar(ctx, f.friendId)))
  },
})

// You + every accepted friend, ranked by Swole Points EARNED in the period.
// Not paginated — friend counts are small.
//
// Ranking on earned rather than on balance is deliberate: spending points on
// a challenge wager must not drop your rank, and winning one must not raise
// it. The board measures training, the balance measures currency.
export const leaderboard = query({
  args: {
    period: v.union(v.literal('week'), v.literal('month')),
    // The UTC period start the client is looking at, passed in rather than
    // derived from Date.now() in here. A Convex query is not re-run merely
    // because time passed, so reading the clock server-side would keep
    // serving last week's board after Sunday midnight. It's also constant for
    // the whole period, so every friend's client shares one cache entry.
    periodStartMs: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    // A client must not be able to invent an arbitrary scoring window.
    const canonicalStart =
      args.period === 'week' ? utcWeekStart(args.periodStartMs) : utcMonthStart(args.periodStartMs)
    if (args.periodStartMs !== canonicalStart) {
      throw new ConvexError('Not a valid period start')
    }
    if (args.periodStartMs > Date.now()) throw new ConvexError('Period is in the future')

    const periodStart = args.periodStartMs
    const periodEnd =
      args.period === 'week' ? utcWeekEnd(periodStart) : utcMonthEnd(periodStart)

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    const memberIds = [userId, ...friendships.map((f) => f.friendId)]

    // One ranged read per member covers both the period being scored and the
    // streak shown beside it. The old version collected every workout ever
    // logged by every friend, then re-walked each one's sets for volume.
    const lookbackStart = Math.min(
      periodStart,
      utcWeekStart(periodEnd - 1) - SCORING_LOOKBACK_WEEKS * WEEK_MS,
    )

    const entries = await Promise.all(
      memberIds.map(async (id) => {
        const [info, history] = await Promise.all([
          profileForWithAvatar(ctx, id),
          finishedWorkoutsBetween(ctx, id, lookbackStart, periodEnd),
        ])

        const streakWeeks = displayStreakWeeks(
          trainedWeekSet(history),
          utcWeekIndex(periodEnd - 1),
        )
        const inPeriod = history.filter((w) => w.startedAt >= periodStart)

        return {
          ...info,
          isMe: id === userId,
          ...summarizePeriod(inPeriod),
          streakWeeks,
          // A streak longer than the lookback can't be measured from this
          // read; the UI renders it as "12+" rather than lying with a number.
          streakCapped: streakWeeks >= SCORING_LOOKBACK_WEEKS,
          tier: consistencyTier(streakWeeks),
        }
      }),
    )

    // Ties broken by days trained, then volume — both are "who did more of
    // the thing the score rewards", so neither can flip the intended ordering.
    return entries.sort(
      (a, b) =>
        b.points - a.points || b.daysTrained - a.daysTrained || b.volumeKg - a.volumeKg,
    )
  },
})

// A friend's (or a public opt-in user's) workout history — read-only, same
// card shape as your own History tab. null = not found, or not permitted.
export const friendWorkouts = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx)
    if (callerId === null) return null

    if (args.userId !== callerId) {
      const [isFriend, targetProfile] = await Promise.all([
        areFriends(ctx, callerId, args.userId),
        ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', args.userId))
          .unique(),
      ])
      if (!isFriend && !targetProfile?.workoutsPublic) return null
    }

    const info = await profileForWithAvatar(ctx, args.userId)
    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', args.userId))
      .order('desc')
      .filter((q) => q.neq(q.field('endedAt'), undefined))
      .collect()

    // Bounded, not paginated — this is a read-only peek, not infinite scroll.
    const recent = workouts.slice(0, 30)
    return { ...info, workouts: await Promise.all(recent.map((w) => summarizeWorkout(ctx, w))) }
  },
})

// Full detail (every exercise, every set) for one of a friend's — or a
// public opt-in user's — workouts. Same permission gate as friendWorkouts
// above; also bundles the owner's identity and consistency tier since the
// friend-facing detail page and trophy card both need to say whose it is.
export const getFriendWorkoutDetail = query({
  args: { workoutId: v.id('workouts') },
  handler: async (ctx, args) => {
    const callerId = await getAuthUserId(ctx)
    if (callerId === null) return null

    const workout = await ctx.db.get(args.workoutId)
    if (!workout || workout.endedAt === undefined) return null
    const ownerId = workout.ownerId

    if (ownerId !== callerId) {
      const [isFriend, ownerProfile] = await Promise.all([
        areFriends(ctx, callerId, ownerId),
        ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', ownerId))
          .unique(),
      ])
      if (!isFriend && !ownerProfile?.workoutsPublic) return null
    }

    const exercises = await getWorkoutExercises(ctx, workout._id)

    const records = await ctx.db
      .query('personalRecords')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect()
    const prExerciseIds = records
      .filter((r) => r.workoutId === workout._id)
      .map((r) => r.exerciseId)

    const [owner, consistency] = await Promise.all([
      profileForWithAvatar(ctx, ownerId),
      ownerConsistency(ctx, ownerId, Date.now()),
    ])

    // `records` is scoped to `ownerId` above, so the slash measures the
    // owner's sets against the owner's PRs — the viewer's records never
    // enter into it, and nothing here escapes the gate applied above.
    return {
      ...workout,
      exercises,
      prExerciseIds,
      eligibleRecords: eligibleRecordsFor(records, workout),
      owner,
      consistency,
    }
  },
})

// ---------- mutations ----------

export const sendFriendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'sendFriendRequest', { key: userId, throws: true })
    const username = cleanUsername(args.username)

    const targetProfile = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!targetProfile) throw new Error('No user with that username')
    const toUserId = targetProfile.userId
    if (toUserId === userId) throw new Error("You can't friend yourself")

    if (await areFriends(ctx, userId, toUserId)) {
      throw new Error('Already friends')
    }

    const [outgoingDup, incomingDup] = await Promise.all([
      ctx.db
        .query('friendRequests')
        .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', toUserId))
        .unique(),
      ctx.db
        .query('friendRequests')
        .withIndex('by_from_to', (q) => q.eq('fromUserId', toUserId).eq('toUserId', userId))
        .unique(),
    ])
    if (outgoingDup || incomingDup) {
      throw new Error('A pending request already exists with this user')
    }

    const outgoingCount = await ctx.db
      .query('friendRequests')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .collect()
    if (outgoingCount.length >= LIMITS.friendRequestsPerUser) {
      throw new Error(`Max ${LIMITS.friendRequestsPerUser} pending requests`)
    }

    await ctx.db.insert('friendRequests', { fromUserId: userId, toUserId })
    await notify(ctx, {
      userId: toUserId,
      kind: 'friend_request_received',
      fromUserId: userId,
    })
  },
})

// Either side can decline/cancel a pending request.
export const declineFriendRequest = mutation({
  args: { requestId: v.id('friendRequests') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const request = await ctx.db.get(args.requestId)
    if (!request || (request.fromUserId !== userId && request.toUserId !== userId)) {
      throw new Error('Request not found')
    }
    await ctx.db.delete(args.requestId)
    // The recipient's "X sent you a friend request" notice is stale either
    // way now — whether they declined it or the sender withdrew it.
    await markHandled(ctx, request.toUserId, 'friend_request_received', request.fromUserId)
  },
})

export const acceptFriendRequest = mutation({
  args: { requestId: v.id('friendRequests') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const request = await ctx.db.get(args.requestId)
    if (!request || request.toUserId !== userId) throw new Error('Request not found')

    const existing = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    if (existing.length >= LIMITS.friendsPerUser) {
      throw new Error(`Max ${LIMITS.friendsPerUser} friends`)
    }

    await ctx.db.delete(args.requestId)
    await ctx.db.insert('friendships', { userId, friendId: request.fromUserId })
    await ctx.db.insert('friendships', { userId: request.fromUserId, friendId: userId })

    // Tell the sender they're in…
    await notify(ctx, {
      userId: request.fromUserId,
      kind: 'friend_request_accepted',
      fromUserId: userId,
    })
    // …and retire my own "X sent you a friend request" notice, which is now
    // stale whether I accepted from the banner or from the Friends page.
    await markHandled(ctx, userId, 'friend_request_received', request.fromUserId)
  },
})

export const removeFriend = mutation({
  args: { friendId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)

    const mine = await ctx.db
      .query('friendships')
      .withIndex('by_user_friend', (q) => q.eq('userId', userId).eq('friendId', args.friendId))
      .unique()
    if (!mine) throw new Error('Not friends')

    const theirs = await ctx.db
      .query('friendships')
      .withIndex('by_user_friend', (q) => q.eq('userId', args.friendId).eq('friendId', userId))
      .unique()

    await ctx.db.delete(mine._id)
    if (theirs) await ctx.db.delete(theirs._id)
  },
})

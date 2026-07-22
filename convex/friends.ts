import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { getWorkoutExercises, summarizeWorkout } from './history'
import { consistencyStreakWeeks, consistencyTier, leaderboardScore, weeksAgo } from './fitness'
import { cleanUsername, LIMITS } from './validation'

async function requireUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not signed in')
  return userId
}

async function profileFor(ctx: QueryCtx, userId: Id<'users'>) {
  const [user, profile] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique(),
  ])
  return {
    userId,
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? user?.email ?? '?',
  }
}

async function areFriends(ctx: QueryCtx, userId: Id<'users'>, otherId: Id<'users'>) {
  const row = await ctx.db
    .query('friendships')
    .withIndex('by_user_friend', (q) => q.eq('userId', userId).eq('friendId', otherId))
    .unique()
  return row !== null
}

// Streak/tier for one specific owner — leaderboard computes this inline for
// a whole friends-batch (and needs the same workouts for volume too, so it
// isn't worth sharing this fetch there); this is for a single arbitrary
// owner, e.g. showing "whose workout is this" on a friend's workout detail.
async function ownerConsistency(ctx: QueryCtx, ownerId: Id<'users'>, now: number) {
  const workouts = await ctx.db
    .query('workouts')
    .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
    .filter((q) => q.neq(q.field('endedAt'), undefined))
    .collect()
  const streakWeeks = consistencyStreakWeeks(
    workouts.map((w) => w.startedAt),
    now,
  )
  return { streakWeeks, tier: consistencyTier(streakWeeks) }
}

// ---------- queries ----------

// Resolve a username to a userId — safe to expose (identity only, no workout
// data): the friend-search box uses this to find who to add or view, and
// friendWorkouts does its own permission check once you get there.
export const resolveUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

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
        from: await profileFor(ctx, r.fromUserId),
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
    return Promise.all(friendships.map((f) => profileFor(ctx, f.friendId)))
  },
})

// You + every accepted friend, ranked by this week's volume with a
// consistency-streak bonus baked in. Not paginated — friend counts are small.
export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    const memberIds = [userId, ...friendships.map((f) => f.friendId)]
    const now = Date.now()

    const entries = await Promise.all(
      memberIds.map(async (id) => {
        const [info, workouts] = await Promise.all([
          profileFor(ctx, id),
          ctx.db
            .query('workouts')
            .withIndex('by_owner', (q) => q.eq('ownerId', id))
            .filter((q) => q.neq(q.field('endedAt'), undefined))
            .collect(),
        ])

        const streakWeeks = consistencyStreakWeeks(
          workouts.map((w) => w.startedAt),
          now,
        )
        const thisWeek = workouts.filter((w) => weeksAgo(w.startedAt, now) === 0)
        const summaries = await Promise.all(thisWeek.map((w) => summarizeWorkout(ctx, w)))
        const weekVolumeKg = summaries.reduce((sum, w) => sum + w.totalVolumeKg, 0)

        return {
          ...info,
          isMe: id === userId,
          weekVolumeKg,
          streakWeeks,
          tier: consistencyTier(streakWeeks),
          score: leaderboardScore(weekVolumeKg, streakWeeks),
        }
      }),
    )

    return entries.sort((a, b) => b.score - a.score)
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

    const info = await profileFor(ctx, args.userId)
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
      profileFor(ctx, ownerId),
      ownerConsistency(ctx, ownerId, Date.now()),
    ])

    return { ...workout, exercises, prExerciseIds, owner, consistency }
  },
})

// ---------- mutations ----------

export const sendFriendRequest = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
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

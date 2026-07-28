import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation } from './_generated/server'
import { rateLimiter } from './rateLimiter'
import { awardPoints } from './profiles'
import { cascadeDeletePost } from './feed'

// Permanently deletes everything tied to the signed-in account: every
// workout/set, routine, custom exercise, favorite, PR, friend connection,
// feature request, and the auth records themselves (sessions, refresh
// tokens, accounts, verification codes, rate-limit counters). Irreversible
// — the frontend gates this behind an explicit confirmation step.
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    // Workouts -> workoutExercises -> sets.
    const workouts = await ctx.db
      .query('workouts')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    for (const workout of workouts) {
      const workoutExercises = await ctx.db
        .query('workoutExercises')
        .withIndex('by_workout', (q) => q.eq('workoutId', workout._id))
        .collect()
      for (const we of workoutExercises) {
        const sets = await ctx.db
          .query('sets')
          .withIndex('by_workoutExercise', (q) => q.eq('workoutExerciseId', we._id))
          .collect()
        for (const s of sets) await ctx.db.delete(s._id)
        await ctx.db.delete(we._id)
      }
      await ctx.db.delete(workout._id)
    }

    // Routines -> routineExercises.
    const routines = await ctx.db
      .query('routines')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    for (const routine of routines) {
      const entries = await ctx.db
        .query('routineExercises')
        .withIndex('by_routine', (q) => q.eq('routineId', routine._id))
        .collect()
      for (const entry of entries) await ctx.db.delete(entry._id)
      await ctx.db.delete(routine._id)
    }

    // Custom exercises — built-ins (ownerId undefined) are untouched, and
    // nobody else can reference a private custom exercise (see exercises.ts),
    // so these are always safe to remove outright.
    const customExercises = await ctx.db
      .query('exercises')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    for (const exercise of customExercises) await ctx.db.delete(exercise._id)

    const favorites = await ctx.db
      .query('favorites')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    for (const f of favorites) await ctx.db.delete(f._id)

    const records = await ctx.db
      .query('personalRecords')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect()
    for (const r of records) await ctx.db.delete(r._id)

    const featureRequests = await ctx.db
      .query('featureRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    for (const r of featureRequests) await ctx.db.delete(r._id)

    // Friend requests, either direction.
    const outgoingRequests = await ctx.db
      .query('friendRequests')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .collect()
    for (const r of outgoingRequests) await ctx.db.delete(r._id)
    const incomingRequests = await ctx.db
      .query('friendRequests')
      .withIndex('by_to', (q) => q.eq('toUserId', userId))
      .collect()
    for (const r of incomingRequests) await ctx.db.delete(r._id)

    // Friendships are stored one row per direction — delete this user's rows
    // plus the matching reverse row on each friend's side (same cleanup
    // `friends.removeFriend` does for a single friend, just for all of them).
    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    for (const f of friendships) {
      const reverse = await ctx.db
        .query('friendships')
        .withIndex('by_user_friend', (q) => q.eq('userId', f.friendId).eq('friendId', userId))
        .unique()
      if (reverse) await ctx.db.delete(reverse._id)
      await ctx.db.delete(f._id)
    }

    // Chat messages in both directions, and this user's read markers. The
    // friend's own read marker pointing back at this user is left alone —
    // it's a harmless timestamp keyed by a now-dead friendId, and finding
    // them would need an index that exists for nothing else.
    const sentMessages = await ctx.db
      .query('messages')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .collect()
    for (const m of sentMessages) await ctx.db.delete(m._id)

    const receivedMessages = await ctx.db
      .query('messages')
      .withIndex('by_to', (q) => q.eq('toUserId', userId))
      .collect()
    for (const m of receivedMessages) await ctx.db.delete(m._id)

    const reads = await ctx.db
      .query('threadReads')
      .withIndex('by_user_friend', (q) => q.eq('userId', userId))
      .collect()
    for (const r of reads) await ctx.db.delete(r._id)

    // Gym pings in both directions. Left behind, these render in the
    // surviving friend's chat thread with the sender's name falling back to
    // '?' once the user document is gone.
    const sentPings = await ctx.db
      .query('gymPings')
      .withIndex('by_from', (q) => q.eq('fromUserId', userId))
      .collect()
    for (const p of sentPings) await ctx.db.delete(p._id)

    const receivedPings = await ctx.db
      .query('gymPings')
      .withIndex('by_to', (q) => q.eq('toUserId', userId))
      .collect()
    for (const p of receivedPings) await ctx.db.delete(p._id)

    // Challenges in both directions.
    //
    // The refund is the load-bearing part. Both sides escrow their wager up
    // front (challenges.ts propose/accept), so deleting a pending or active
    // challenge without paying the survivor back leaves their points debited
    // with no path to recovery. Worse, leaving the rows entirely meant
    // challenges.resolveExpired would later award points to a deleted user,
    // and awardPoints -> getOrCreateProfile would insert a fresh profile row
    // pointing at a user document that no longer exists — one new orphan per
    // cron run.
    const challenges = [
      ...(await ctx.db
        .query('challenges')
        .withIndex('by_challenger', (q) => q.eq('challengerId', userId))
        .collect()),
      ...(await ctx.db
        .query('challenges')
        .withIndex('by_opponent', (q) => q.eq('opponentId', userId))
        .collect()),
    ]
    for (const challenge of challenges) {
      const survivorId =
        challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId

      // 'pending' means only the challenger has escrowed; 'active' means both
      // have. Resolved/declined/cancelled rows already settled up.
      if (challenge.status === 'active') {
        await awardPoints(ctx, survivorId, challenge.wagerPoints)
      } else if (challenge.status === 'pending' && challenge.challengerId !== userId) {
        // The departing user is the opponent, who hasn't escrowed yet — so
        // it's the surviving challenger who needs their stake back.
        await awardPoints(ctx, survivorId, challenge.wagerPoints)
      }
      await ctx.db.delete(challenge._id)
    }

    // Feed posts, in BOTH directions — my own posts, and the likes and
    // comments I left on other people's.
    //
    // The counter decrements on the second half are the part that gets
    // forgotten: without them, deleting a prolific liker leaves every post
    // they ever touched permanently over-counted, and nothing would ever
    // correct it.
    const myPosts = await ctx.db
      .query('posts')
      .withIndex('by_author_createdAt', (q) => q.eq('authorId', userId))
      .collect()
    for (const post of myPosts) await cascadeDeletePost(ctx, post)

    const myLikes = await ctx.db
      .query('postLikes')
      .withIndex('by_user_post', (q) => q.eq('userId', userId))
      .collect()
    for (const like of myLikes) {
      const post = await ctx.db.get(like.postId)
      if (post) await ctx.db.patch(post._id, { likeCount: Math.max(0, post.likeCount - 1) })
      await ctx.db.delete(like._id)
    }

    const myComments = await ctx.db
      .query('postComments')
      .withIndex('by_author', (q) => q.eq('authorId', userId))
      .collect()
    for (const comment of myComments) {
      const post = await ctx.db.get(comment.postId)
      if (post) {
        await ctx.db.patch(post._id, { commentCount: Math.max(0, post.commentCount - 1) })
      }
      await ctx.db.delete(comment._id)
    }

    const myReports = await ctx.db
      .query('postReports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
      .collect()
    for (const report of myReports) await ctx.db.delete(report._id)

    // Blocks in both directions.
    const blocksIMade = await ctx.db
      .query('blockedUsers')
      .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
      .collect()
    for (const b of blocksIMade) await ctx.db.delete(b._id)

    const blocksAgainstMe = await ctx.db
      .query('blockedUsers')
      .withIndex('by_blocked', (q) => q.eq('blockedUserId', userId))
      .collect()
    for (const b of blocksAgainstMe) await ctx.db.delete(b._id)

    // Notifications in both directions: the ones addressed to this user, and
    // the ones this user left sitting in other people's banners (which would
    // otherwise render as "Someone" once the user document is gone).
    const receivedNotifications = await ctx.db
      .query('notifications')
      .withIndex('by_user_readAt', (q) => q.eq('userId', userId))
      .collect()
    for (const n of receivedNotifications) await ctx.db.delete(n._id)

    const sentNotifications = await ctx.db
      .query('notifications')
      .withIndex('by_fromUser', (q) => q.eq('fromUserId', userId))
      .collect()
    for (const n of sentNotifications) await ctx.db.delete(n._id)

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (profile) {
      // Deleting the profile row alone would orphan the avatar blob in file
      // storage, where nothing would ever reference or reclaim it.
      if (profile.avatarStorageId) await ctx.storage.delete(profile.avatarStorageId)
      await ctx.db.delete(profile._id)
    }

    // Auth records: sessions + their refresh tokens, accounts + their
    // verification codes, then any rate-limit counters keyed to this
    // account's identifiers (so a future sign-up with the same email isn't
    // throttled by a counter left over from the deleted account).
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect()
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect()
      for (const token of refreshTokens) await ctx.db.delete(token._id)
      await ctx.db.delete(session._id)
    }

    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect()
    for (const account of accounts) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect()
      for (const code of codes) await ctx.db.delete(code._id)

      for (const identifier of [account.providerAccountId, account._id]) {
        const limit = await ctx.db
          .query('authRateLimits')
          .withIndex('identifier', (q) => q.eq('identifier', identifier))
          .unique()
        if (limit) await ctx.db.delete(limit._id)
      }
      await ctx.db.delete(account._id)
    }

    // Our own OTP-send throttle (convex/emailAuth.ts, backed by the shared
    // rate-limiter component — see convex/rateLimiter.ts), keyed by email —
    // same reasoning as the auth rate limits above.
    const user = await ctx.db.get(userId)
    if (user?.email) {
      const email = user.email.toLowerCase()
      for (const kind of ['verify', 'reset'] as const) {
        await rateLimiter.reset(ctx, 'otpSend', { key: `${kind}:${email}` })
      }
    }

    await ctx.db.delete(userId)
  },
})

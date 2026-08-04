import { getAuthUserId } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import { internalMutation, mutation, type MutationCtx } from './_generated/server'
import { internal } from './_generated/api'
import { rateLimiter } from './rateLimiter'
import { awardPoints } from './profiles'
import { cascadeDeletePost } from './feed'

// Deleting an account touches ~28 tables. Doing it in one mutation worked
// fine for small accounts and would have failed outright for a heavy one:
// Convex transactions have read/write ceilings, and a mutation is
// all-or-nothing, so exceeding them doesn't half-delete — it throws, and the
// user who asked to be forgotten stays. The more they'd used the app, the
// more certain their deletion request was to fail.
//
// So it's split in two:
//
//   deleteAccount     — small, synchronous, and the part that must be
//                       immediate: tear down auth so the account cannot be
//                       used again, then hand the bulk off.
//   purgeAccountData  — batched and self-rescheduling, deleting everything
//                       else a few hundred documents at a time.
//
// The window between them is seconds, and during it the account is already
// unusable: no sessions, no credentials, no profile.

// Documents per purge run. Well under Convex's transaction limits, with room
// for the largest single unit of work below (one workout, or one post plus
// its likes/comments/reposts) to overshoot without getting close.
const PURGE_BUDGET = 400

type Budget = { left: number }

// The exact id union `ctx.db.delete` accepts, so the drain helper stays
// type-safe across tables instead of casting.
type AnyId = Parameters<MutationCtx['db']['delete']>[0]

/**
 * Delete rows produced by `fetch` until the table is empty or the budget runs
 * out. `fetch` re-queries each round rather than paging a cursor: rows are
 * being deleted as we go, so "the first N remaining" is always correct and
 * always makes progress, which is what makes a resumed run safe.
 */
async function drain(
  ctx: MutationCtx,
  budget: Budget,
  fetch: (limit: number) => Promise<{ _id: AnyId }[]>,
): Promise<void> {
  while (budget.left > 0) {
    const rows = await fetch(Math.min(budget.left, 100))
    if (rows.length === 0) return
    for (const row of rows) {
      await ctx.db.delete(row._id)
      budget.left--
    }
  }
}

/**
 * Everything owned by a departed account, deleted in batches.
 *
 * Ordered by what other people can see: refunds and social rows first, so a
 * surviving friend stops seeing the departed user (and gets their points back)
 * as early as possible; the user's own private bulk last, since nobody is
 * waiting on it.
 *
 * Idempotent and resumable — each step drains "whatever is left", so a
 * rescheduled run simply continues. The `users` row is deleted last and is
 * therefore the marker that the purge finished.
 */
export const purgeAccountData = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const budget: Budget = { left: PURGE_BUDGET }

    // --- challenges: refunds first, they owe someone points ---
    //
    // The refund is the load-bearing part. Both sides escrow their wager up
    // front (challenges.ts propose/accept), so deleting a pending or active
    // challenge without paying the survivor back leaves their points debited
    // with no path to recovery. Leaving the rows instead meant
    // challenges.resolveExpired would later award points to a deleted user,
    // and awardPoints -> getOrCreateProfile would insert a fresh profile row
    // pointing at a user document that no longer exists.
    const nextChallenge = async () =>
      (await ctx.db
        .query('challenges')
        .withIndex('by_challenger', (q) => q.eq('challengerId', userId))
        .first()) ??
      (await ctx.db
        .query('challenges')
        .withIndex('by_opponent', (q) => q.eq('opponentId', userId))
        .first())

    while (budget.left > 0) {
      const challenge = await nextChallenge()
      if (!challenge) break

      const survivorId =
        challenge.challengerId === userId ? challenge.opponentId : challenge.challengerId

      // The "survivor" may themselves be mid-deletion. That could not happen
      // when this ran in one transaction, but two purges can now interleave,
      // and awardPoints -> getOrCreateProfile would INSERT a fresh profile row
      // pointing at a user document that is being torn down — recreating
      // exactly the orphan this cleanup exists to prevent. No one to refund
      // means nothing to refund.
      const survivorExists = (await ctx.db.get(survivorId)) !== null

      // 'pending' means only the challenger has escrowed; 'active' means both
      // have. Resolved/declined/cancelled rows already settled up.
      if (survivorExists && challenge.status === 'active') {
        await awardPoints(ctx, survivorId, challenge.wagerPoints)
      } else if (
        survivorExists &&
        challenge.status === 'pending' &&
        challenge.challengerId !== userId
      ) {
        // The departing user is the opponent, who hasn't escrowed yet — so
        // it's the surviving challenger who needs their stake back.
        await awardPoints(ctx, survivorId, challenge.wagerPoints)
      }
      await ctx.db.delete(challenge._id)
      budget.left -= 2
    }

    // --- feed: my posts, then my traces on other people's ---
    //
    // Budget is checked between posts, not inside cascadeDeletePost: one post
    // plus its likes, comments and reposts is bounded (commentsPerPost is 500)
    // and must be deleted as a unit, or a resumed run would see a half-erased
    // post with stale counters.
    while (budget.left > 0) {
      const post = await ctx.db
        .query('posts')
        .withIndex('by_author_createdAt', (q) => q.eq('authorId', userId))
        .first()
      if (!post) break
      await cascadeDeletePost(ctx, post)
      budget.left -= 25
    }

    // The counter decrements here are the part that gets forgotten: without
    // them, deleting a prolific liker leaves every post they ever touched
    // permanently over-counted, and nothing would ever correct it.
    while (budget.left > 0) {
      const like = await ctx.db
        .query('postLikes')
        .withIndex('by_user_post', (q) => q.eq('userId', userId))
        .first()
      if (!like) break
      const post = await ctx.db.get(like.postId)
      if (post) await ctx.db.patch(post._id, { likeCount: Math.max(0, post.likeCount - 1) })
      await ctx.db.delete(like._id)
      budget.left -= 2
    }

    while (budget.left > 0) {
      const comment = await ctx.db
        .query('postComments')
        .withIndex('by_author', (q) => q.eq('authorId', userId))
        .first()
      if (!comment) break
      const post = await ctx.db.get(comment.postId)
      if (post) {
        await ctx.db.patch(post._id, { commentCount: Math.max(0, post.commentCount - 1) })
      }
      await ctx.db.delete(comment._id)
      budget.left -= 2
    }

    await drain(ctx, budget, (n) =>
      ctx.db
        .query('postReports')
        .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
        .take(n),
    )

    // --- things other users can see ---

    // Notifications in both directions: the ones addressed to this user, and
    // the ones this user left sitting in other people's banners (which would
    // otherwise render as "Someone" once the user document is gone).
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_readAt', (q) => q.eq('userId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('notifications')
        .withIndex('by_fromUser', (q) => q.eq('fromUserId', userId))
        .take(n),
    )

    // Chat messages in both directions, and this user's read markers. The
    // friend's own read marker pointing back at this user is left alone —
    // it's a harmless timestamp keyed by a now-dead friendId, and finding
    // them would need an index that exists for nothing else.
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('messages')
        .withIndex('by_from', (q) => q.eq('fromUserId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('messages')
        .withIndex('by_to', (q) => q.eq('toUserId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('threadReads')
        .withIndex('by_user_friend', (q) => q.eq('userId', userId))
        .take(n),
    )

    // Gym pings in both directions. Left behind, these render in the
    // surviving friend's chat thread with the sender's name falling back to
    // '?' once the user document is gone.
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('gymPings')
        .withIndex('by_from', (q) => q.eq('fromUserId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('gymPings')
        .withIndex('by_to', (q) => q.eq('toUserId', userId))
        .take(n),
    )

    // Friendships are stored one row per direction — delete this user's rows
    // plus the matching reverse row on each friend's side (the same cleanup
    // friends.removeFriend does for one friend, for all of them).
    while (budget.left > 0) {
      const friendship = await ctx.db
        .query('friendships')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first()
      if (!friendship) break
      const reverse = await ctx.db
        .query('friendships')
        .withIndex('by_user_friend', (q) =>
          q.eq('userId', friendship.friendId).eq('friendId', userId),
        )
        .unique()
      if (reverse) await ctx.db.delete(reverse._id)
      await ctx.db.delete(friendship._id)
      budget.left -= 2
    }

    await drain(ctx, budget, (n) =>
      ctx.db
        .query('friendRequests')
        .withIndex('by_from', (q) => q.eq('fromUserId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('friendRequests')
        .withIndex('by_to', (q) => q.eq('toUserId', userId))
        .take(n),
    )

    await drain(ctx, budget, (n) =>
      ctx.db
        .query('blockedUsers')
        .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('blockedUsers')
        .withIndex('by_blocked', (q) => q.eq('blockedUserId', userId))
        .take(n),
    )

    // --- the user's own private bulk ---

    // Workouts -> workoutExercises -> sets. Budget is checked between
    // workouts: one workout is bounded (30 exercises x 30 sets) and its
    // children must go before it, or a resumed run would find orphaned sets
    // with no owning workout to reach them by.
    while (budget.left > 0) {
      const workout = await ctx.db
        .query('workouts')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .first()
      if (!workout) break
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
        budget.left -= sets.length + 1
      }
      await ctx.db.delete(workout._id)
      budget.left -= 1
    }

    // Routines -> routineExercises, same shape.
    while (budget.left > 0) {
      const routine = await ctx.db
        .query('routines')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .first()
      if (!routine) break
      const entries = await ctx.db
        .query('routineExercises')
        .withIndex('by_routine', (q) => q.eq('routineId', routine._id))
        .collect()
      for (const entry of entries) await ctx.db.delete(entry._id)
      await ctx.db.delete(routine._id)
      budget.left -= entries.length + 1
    }

    // Custom exercises — built-ins (ownerId undefined) are untouched, and
    // nobody else can reference a private custom exercise (see exercises.ts),
    // so these are always safe to remove outright.
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('exercises')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('favorites')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('personalRecords')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .take(n),
    )
    await drain(ctx, budget, (n) =>
      ctx.db
        .query('featureRequests')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(n),
    )

    if (budget.left <= 0) {
      // More to do — pick up where this run stopped.
      await ctx.scheduler.runAfter(0, internal.account.purgeAccountData, { userId })
      return { done: false }
    }

    // Nothing left anywhere, so the user row can go. Deleting it last makes
    // its absence the signal that the purge completed.
    //
    // Guarded because this function must tolerate being run again: Convex may
    // retry a scheduled function, and deleting an already-deleted document
    // throws ("Delete on non-existent doc"), which would turn a harmless
    // duplicate into a permanently failing job.
    if ((await ctx.db.get(userId)) !== null) await ctx.db.delete(userId)
    return { done: true }
  },
})

/**
 * Permanently delete the signed-in account. Irreversible — the frontend gates
 * this behind an explicit confirmation step.
 *
 * This half is deliberately small and does only what must be immediate:
 * revoke every credential so the account cannot be used again, drop the
 * profile (and its avatar blob) so the user disappears from other people's
 * screens, then schedule the bulk purge. Everything here is bounded by how
 * many devices someone signed in from, not by how much they used the app.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    await rateLimiter.limit(ctx, 'deleteAccount', { key: userId, throws: true })

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
    // same reasoning as the auth rate limits above. Read before the profile
    // goes, since it needs the user document.
    const user = await ctx.db.get(userId)
    if (user?.email) {
      const email = user.email.toLowerCase()
      for (const kind of ['verify', 'reset'] as const) {
        await rateLimiter.reset(ctx, 'otpSend', { key: `${kind}:${email}` })
      }
    }

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

    // Scheduled from inside the transaction, so it is queued only if this
    // mutation commits — no purge is ever kicked off for an account that
    // wasn't actually torn down.
    await ctx.scheduler.runAfter(0, internal.account.purgeAccountData, { userId })
  },
})

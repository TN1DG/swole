import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation } from './_generated/server'

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

    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (profile) await ctx.db.delete(profile._id)

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

    // Our own email-send throttle table (convex/emailAuth.ts), keyed by
    // email — same reasoning as the auth rate limits above.
    const user = await ctx.db.get(userId)
    if (user?.email) {
      const email = user.email.toLowerCase()
      for (const kind of ['verify', 'reset'] as const) {
        const attempt = await ctx.db
          .query('emailSendAttempts')
          .withIndex('by_key', (q) => q.eq('key', `${kind}:${email}`))
          .unique()
        if (attempt) await ctx.db.delete(attempt._id)
      }
    }

    await ctx.db.delete(userId)
  },
})

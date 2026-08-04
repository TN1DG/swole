import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import {
  createBackend,
  createBuiltInExercise,
  givePoints,
  pointsOf,
  twoFriends,
  userWithUsername,
  deleteAccountAndPurge,
  type T,
} from './test.helpers'

describe('deleteAccount', () => {
  it('removes every owned row across the app: workouts, routines, favorites, PRs, custom exercises, feature requests, profile', async () => {
    const t = createBackend()
    const builtIn = await createBuiltInExercise(t)
    const { userId, user } = await userWithUsername(t, 'alice')

    // A finished workout with a PR.
    const workoutId = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId: builtIn })
    const active = await user.query(api.workouts.getActive, {})
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id,
      weightKg: 100,
      reps: 5,
      completed: true,
    })
    await user.mutation(api.workouts.finish, { workoutId })

    // A custom exercise, a routine using it, and a favorite.
    const customExerciseId = await user.mutation(api.exercises.create, {
      name: 'My Curl',
      muscleGroup: 'Biceps',
    })
    await user.mutation(api.routines.create, {
      name: 'My Routine',
      exercises: [{ exerciseId: customExerciseId, targetSets: 3 }],
    })
    await user.mutation(api.favorites.toggle, { exerciseId: builtIn })
    await user.mutation(api.featureRequests.submit, { text: 'Add a rest timer' })

    await deleteAccountAndPurge(t, user)

    // Everything scoped to this user is gone.
    await t.run(async (ctx) => {
      const rowsFor = (table: 'workouts' | 'routines' | 'favorites' | 'exercises') =>
        ctx.db
          .query(table)
          .filter((q) => q.eq(q.field('ownerId'), userId))
          .collect()
      expect(await rowsFor('workouts')).toEqual([])
      expect(await rowsFor('routines')).toEqual([])
      expect(await rowsFor('favorites')).toEqual([])
      expect(await rowsFor('exercises')).toEqual([]) // custom one gone; built-ins untouched elsewhere

      expect(
        await ctx.db
          .query('personalRecords')
          .filter((q) => q.eq(q.field('ownerId'), userId))
          .collect(),
      ).toEqual([])
      expect(
        await ctx.db
          .query('featureRequests')
          .withIndex('by_user', (q) => q.eq('userId', userId))
          .collect(),
      ).toEqual([])
      expect(
        await ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', userId))
          .collect(),
      ).toEqual([])
      expect(await ctx.db.get(userId)).toBeNull()

      // Built-in exercise itself is untouched.
      expect(await ctx.db.get(builtIn)).not.toBeNull()
    })
  })

  it('removes friend requests and both directions of any friendship, without touching the other user', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const eve = await userWithUsername(t, 'eve')

    // Alice <-> Bob are friends; Eve has a pending outgoing request to Alice.
    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})
    await bob.user.mutation(api.friends.acceptFriendRequest, { requestId: incoming.requestId })
    await eve.user.mutation(api.friends.sendFriendRequest, { username: 'alice' })

    await deleteAccountAndPurge(t, alice.user)

    expect(await bob.user.query(api.friends.myFriends, {})).toEqual([])
    expect(await eve.user.query(api.friends.myOutgoingRequests, {})).toEqual([])
    // Bob's own profile/account is completely unaffected.
    expect((await bob.user.query(api.profiles.getMine, {}))!.username).toBe('bob')
  })

  it('removes the underlying auth records (account, session, user)', async () => {
    const t = createBackend()
    const { userId, user } = await userWithUsername(t, 'alice')

    // Simulate a real auth account/session, since createUser only inserts
    // a bare users row (the test-identity trick bypasses real sign-in).
    const accountId = await t.run(async (ctx) =>
      ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'alice@test.local',
        emailVerified: 'alice@test.local',
      }),
    )
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 100_000 }),
    )
    await t.run(async (ctx) =>
      ctx.db.insert('authRefreshTokens', { sessionId, expirationTime: Date.now() + 100_000 }),
    )

    await deleteAccountAndPurge(t, user)

    await t.run(async (ctx) => {
      expect(await ctx.db.get(accountId)).toBeNull()
      expect(await ctx.db.get(sessionId)).toBeNull()
      expect(
        await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', sessionId))
          .collect(),
      ).toEqual([])
    })
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(t.mutation(api.account.deleteAccount, {})).rejects.toThrow(/not signed in/i)
  })
})

describe('deleteAccount: pings and challenges', () => {
  it('removes gym pings in both directions', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    await bob.user.mutation(api.pings.send, { toUserId: alice.userId })

    await deleteAccountAndPurge(t, alice.user)

    const remaining = await t.run(async (ctx) => ctx.db.query('gymPings').collect())
    expect(remaining).toHaveLength(0)
  })

  it('refunds an active challenge to the surviving friend', async () => {
    // Both sides escrowed. Deleting without a refund debits the survivor
    // permanently, with no path to recovery.
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 100)
    await givePoints(t, bob.userId, 100)

    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await bob.user.mutation(api.challenges.accept, { challengeId })
    expect(await pointsOf(t, bob.userId)).toBe(80)

    await deleteAccountAndPurge(t, alice.user)

    expect(await pointsOf(t, bob.userId)).toBe(100)
    const remaining = await t.run(async (ctx) => ctx.db.query('challenges').collect())
    expect(remaining).toHaveLength(0)
  })

  it('refunds a pending challenge to the challenger when the opponent leaves', async () => {
    // Only the challenger has escrowed at this point, so they are the one
    // owed their stake back.
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 100)

    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 30,
    })
    expect(await pointsOf(t, alice.userId)).toBe(70)

    await deleteAccountAndPurge(t, bob.user)

    expect(await pointsOf(t, alice.userId)).toBe(100)
  })

  it('does not refund an already-settled challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 100)

    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await bob.user.mutation(api.challenges.decline, { challengeId })
    expect(await pointsOf(t, alice.userId)).toBe(100) // already refunded

    await deleteAccountAndPurge(t, bob.user)
    expect(await pointsOf(t, alice.userId)).toBe(100) // not double-refunded
  })
})

describe('deleteAccount: the synchronous/async split', () => {
  // The whole point of the split is that the security-critical half does not
  // wait on the bulk delete. If this ever regresses, a deleted account stays
  // usable for as long as the purge takes.
  it('revokes every credential immediately, before the purge has run', async () => {
    const t: T = createBackend()
    const { userId, user } = await userWithUsername(t, 'alice')

    const accountId = await t.run(async (ctx) =>
      ctx.db.insert('authAccounts', {
        userId,
        provider: 'password',
        providerAccountId: 'alice@test.local',
        emailVerified: 'alice@test.local',
      }),
    )
    const sessionId = await t.run(async (ctx) =>
      ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 100_000 }),
    )
    await user.mutation(api.workouts.start, {})

    // Note: no scheduler drain here — this is the state between the two halves.
    await user.mutation(api.account.deleteAccount, {})

    await t.run(async (ctx) => {
      expect(await ctx.db.get(accountId)).toBeNull()
      expect(await ctx.db.get(sessionId)).toBeNull()
      expect(
        await ctx.db
          .query('profiles')
          .withIndex('by_user', (q) => q.eq('userId', userId))
          .collect(),
      ).toEqual([])
      // The bulk data is still there, and that is fine — nobody can reach it.
      expect(await ctx.db.query('workouts').collect()).toHaveLength(1)
    })

    const scheduled = await t.run(async (ctx) =>
      ctx.db.system.query('_scheduled_functions').collect(),
    )
    expect(scheduled.map((s) => s.name)).toContain('account:purgeAccountData')
  })

  it('is idempotent — re-running the purge after it finished is a no-op', async () => {
    const t: T = createBackend()
    const { userId, user } = await userWithUsername(t, 'alice')
    await user.mutation(api.workouts.start, {})

    await deleteAccountAndPurge(t, user)
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toBeNull()

    // A retried or duplicated run must not throw on already-deleted rows.
    await expect(
      t.mutation(internal.account.purgeAccountData, { userId }),
    ).resolves.toBeDefined()
  })
})

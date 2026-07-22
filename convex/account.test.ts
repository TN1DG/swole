import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { asUser, createBackend, createBuiltInExercise, createUser, type T } from './test.helpers'

async function userWithUsername(t: T, name: string) {
  const userId = await createUser(t, name)
  const user = asUser(t, userId)
  await user.mutation(api.profiles.setUsername, { username: name })
  return { userId, user }
}

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

    await user.mutation(api.account.deleteAccount, {})

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

    await alice.user.mutation(api.account.deleteAccount, {})

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

    await user.mutation(api.account.deleteAccount, {})

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

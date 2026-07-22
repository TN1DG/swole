import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  type T,
} from './test.helpers'

async function userWithUsername(t: T, name: string) {
  const userId = await createUser(t, name)
  const user = asUser(t, userId)
  await user.mutation(api.profiles.setUsername, { username: name })
  return { userId, user }
}

// Alice sends, Bob accepts. Returns everyone's handles.
async function twoFriends(t: T) {
  const alice = await userWithUsername(t, 'alice')
  const bob = await userWithUsername(t, 'bob')
  await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
  const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})
  await bob.user.mutation(api.friends.acceptFriendRequest, { requestId: incoming.requestId })
  return { alice, bob }
}

// Logs one completed workout for `user` on `exerciseId`, `daysAgo` in the past.
async function logWorkout(
  t: T,
  user: ReturnType<typeof asUser>,
  exerciseId: Awaited<ReturnType<typeof createBuiltInExercise>>,
  daysAgo: number,
  weightKg = 100,
) {
  const workoutId = await user.mutation(api.workouts.start, {})
  await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
  const active = await user.query(api.workouts.getActive, {})
  await user.mutation(api.workouts.updateSet, {
    setId: active!.exercises[0].sets[0]._id,
    weightKg,
    reps: 5,
    completed: true,
  })
  await user.mutation(api.workouts.finish, { workoutId })
  // Backdate it directly — the mutations above always use Date.now().
  await t.run(async (ctx) => {
    const workout = (await ctx.db.get(workoutId))!
    const shift = daysAgo * 24 * 60 * 60 * 1000
    await ctx.db.patch(workoutId, {
      startedAt: workout.startedAt - shift,
      endedAt: (workout.endedAt ?? workout.startedAt) - shift,
    })
  })
  return workoutId
}

describe('resolveUsername', () => {
  it('finds a user by username, case-insensitively', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    const found = await bob.user.query(api.friends.resolveUsername, { username: 'ALICE' })
    expect(found).toMatchObject({ userId: alice.userId, username: 'alice', isMe: false })
  })

  it('returns null for an unknown username', async () => {
    const t = createBackend()
    const bob = await userWithUsername(t, 'bob')
    expect(
      await bob.user.query(api.friends.resolveUsername, { username: 'nobody' }),
    ).toBeNull()
  })
})

describe('sendFriendRequest', () => {
  it('creates a request visible to both sides', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    const outgoing = await alice.user.query(api.friends.myOutgoingRequests, {})
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0].to.username).toBe('bob')

    const incoming = await bob.user.query(api.friends.myIncomingRequests, {})
    expect(incoming).toHaveLength(1)
    expect(incoming[0].from.username).toBe('alice')
  })

  it('rejects friending yourself, an unknown username, or a duplicate request', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await userWithUsername(t, 'bob')

    await expect(
      alice.user.mutation(api.friends.sendFriendRequest, { username: 'alice' }),
    ).rejects.toThrow(/yourself/i)
    await expect(
      alice.user.mutation(api.friends.sendFriendRequest, { username: 'nobody' }),
    ).rejects.toThrow(/no user/i)

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    await expect(
      alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' }),
    ).rejects.toThrow(/pending request/i)
  })

  it('rejects a request between users who are already friends', async () => {
    const t = createBackend()
    const { alice } = await twoFriends(t)
    await expect(
      alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' }),
    ).rejects.toThrow(/already friends/i)
  })
})

describe('accept / decline', () => {
  it('accepting creates a two-way friendship and removes the request', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    expect(await alice.user.query(api.friends.myOutgoingRequests, {})).toEqual([])
    expect(await bob.user.query(api.friends.myIncomingRequests, {})).toEqual([])

    const aliceFriends = await alice.user.query(api.friends.myFriends, {})
    expect(aliceFriends.map((f) => f.username)).toEqual(['bob'])
    const bobFriends = await bob.user.query(api.friends.myFriends, {})
    expect(bobFriends.map((f) => f.username)).toEqual(['alice'])
  })

  it('either side can decline/cancel a pending request', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})
    await bob.user.mutation(api.friends.declineFriendRequest, { requestId: incoming.requestId })

    expect(await alice.user.query(api.friends.myOutgoingRequests, {})).toEqual([])
    expect(await alice.user.query(api.friends.myFriends, {})).toEqual([])
  })

  it("only the recipient can accept — not the sender, not a stranger", async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const eve = await userWithUsername(t, 'eve')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})

    await expect(
      alice.user.mutation(api.friends.acceptFriendRequest, { requestId: incoming.requestId }),
    ).rejects.toThrow(/not found/i)
    await expect(
      eve.user.mutation(api.friends.acceptFriendRequest, { requestId: incoming.requestId }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('removeFriend', () => {
  it('removes both directions of the friendship', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.friends.removeFriend, { friendId: bob.userId })

    expect(await alice.user.query(api.friends.myFriends, {})).toEqual([])
    expect(await bob.user.query(api.friends.myFriends, {})).toEqual([])
  })

  it('a stranger cannot remove a friendship they are not part of', async () => {
    const t = createBackend()
    const { bob } = await twoFriends(t)
    const eve = await userWithUsername(t, 'eve')

    await expect(
      eve.user.mutation(api.friends.removeFriend, { friendId: bob.userId }),
    ).rejects.toThrow(/not friends/i)
  })
})

describe('friendWorkouts', () => {
  it('a friend can view your workouts; a stranger cannot', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const eve = await userWithUsername(t, 'eve')

    await logWorkout(t, alice.user, exerciseId, 0)

    const asFriend = await bob.user.query(api.friends.friendWorkouts, { userId: alice.userId })
    expect(asFriend?.workouts).toHaveLength(1)

    const asStranger = await eve.user.query(api.friends.friendWorkouts, { userId: alice.userId })
    expect(asStranger).toBeNull()
  })

  it('a public profile is visible to anyone, friend or not', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const eve = await userWithUsername(t, 'eve')

    await logWorkout(t, alice.user, exerciseId, 0)
    expect(await eve.user.query(api.friends.friendWorkouts, { userId: alice.userId })).toBeNull()

    await alice.user.mutation(api.profiles.setWorkoutsPublic, { workoutsPublic: true })
    const visible = await eve.user.query(api.friends.friendWorkouts, { userId: alice.userId })
    expect(visible?.workouts).toHaveLength(1)
  })

  it('requires sign-in', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const anon: T = t
    expect(await anon.query(api.friends.friendWorkouts, { userId: alice.userId })).toBeNull()
  })
})

describe('getFriendWorkoutDetail', () => {
  it('a friend sees full set-by-set detail, owner identity, and consistency', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    const workoutId = await logWorkout(t, alice.user, exerciseId, 0, 120)

    const detail = await bob.user.query(api.friends.getFriendWorkoutDetail, { workoutId })
    expect(detail).not.toBeNull()
    expect(detail!.owner.displayName).toBe('alice@test.local')
    expect(detail!.exercises).toHaveLength(1)
    expect(detail!.exercises[0].sets[0]).toMatchObject({ weightKg: 120, reps: 5 })
    expect(detail!.consistency).toMatchObject({ streakWeeks: 1, tier: 'none' })
  })

  it('a stranger cannot see it; a public opt-in makes it visible to anyone', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const eve = await userWithUsername(t, 'eve')

    const workoutId = await logWorkout(t, alice.user, exerciseId, 0)
    expect(await eve.user.query(api.friends.getFriendWorkoutDetail, { workoutId })).toBeNull()

    await alice.user.mutation(api.profiles.setWorkoutsPublic, { workoutsPublic: true })
    const detail = await eve.user.query(api.friends.getFriendWorkoutDetail, { workoutId })
    expect(detail).not.toBeNull()
    expect(detail!.owner.displayName).toBe('alice@test.local')
  })

  it('returns null for an in-progress (unfinished) workout', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const workoutId = await alice.user.mutation(api.workouts.start, {})

    expect(await bob.user.query(api.friends.getFriendWorkoutDetail, { workoutId })).toBeNull()
  })

  it('requires sign-in', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const exerciseId = await createBuiltInExercise(t)
    const workoutId = await logWorkout(t, alice.user, exerciseId, 0)

    const anon: T = t
    expect(await anon.query(api.friends.getFriendWorkoutDetail, { workoutId })).toBeNull()
  })
})

describe('leaderboard', () => {
  it('includes you and your friends, ranked by this-week score', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    // Alice: one big workout this week, nothing before.
    await logWorkout(t, alice.user, exerciseId, 0, 200)
    // Bob: smaller this week, but logged every week for the last 3 -> streak bonus.
    await logWorkout(t, bob.user, exerciseId, 0, 50)
    await logWorkout(t, bob.user, exerciseId, 8, 50)
    await logWorkout(t, bob.user, exerciseId, 15, 50)

    const board = await alice.user.query(api.friends.leaderboard, {})
    expect(board).toHaveLength(2)

    const aliceEntry = board.find((e) => e.username === 'alice')!
    const bobEntry = board.find((e) => e.username === 'bob')!
    expect(aliceEntry.weekVolumeKg).toBe(1000) // 200kg x 5 reps
    expect(aliceEntry.streakWeeks).toBe(1)
    expect(aliceEntry.tier).toBe('none')

    expect(bobEntry.weekVolumeKg).toBe(250) // 50kg x 5 reps
    expect(bobEntry.streakWeeks).toBe(3)
    expect(bobEntry.tier).toBe('consistent')
    expect(bobEntry.score).toBe(Math.round(250 * 1.15)) // +5%/week x 3

    // Alice's raw volume is much higher, so she still ranks first here.
    expect(board[0].username).toBe('alice')
  })

  it('a solo user (no friends yet) sees just themselves', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const board = await alice.user.query(api.friends.leaderboard, {})
    expect(board).toHaveLength(1)
    expect(board[0].isMe).toBe(true)
  })
})

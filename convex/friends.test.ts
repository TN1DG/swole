import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { DAY_MS, epley1rm, utcMonthStart, utcWeekStart, WEEK_MS } from './fitness'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  logWorkoutOn,
  twoFriends,
  userWithUsername,
  type T,
} from './test.helpers'

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

  // Regression: `displayName` used to fall back to the user's email address.
  // Anyone can call resolveUsername against any username, so that published
  // the email of every account that had a username but no display name — a
  // state `setUsername` can produce on its own, since it doesn't set one.
  it('never exposes the email address of a user who has no display name', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    const found = await bob.user.query(api.friends.resolveUsername, { username: 'alice' })
    expect(found).not.toBeNull()
    expect(found!.displayName).not.toContain('@')
    expect(found!.displayName).toBe('alice')
    expect(JSON.stringify(found)).not.toContain('test.local')
    expect(alice.userId).toBeTruthy()
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

  it('rate limits a burst of requests from the same sender', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')

    // The 'sendFriendRequest' token bucket (convex/rateLimiter.ts) has a
    // burst capacity of 5. A rejected request rolls back its own mutation
    // (Convex mutations are all-or-nothing), which undoes the token it
    // consumed — so this has to be a run of *successful* sends, each to a
    // distinct target, to actually observe the limit.
    for (let i = 0; i < 5; i++) {
      await userWithUsername(t, `target${i}`)
      await alice.user.mutation(api.friends.sendFriendRequest, { username: `target${i}` })
    }
    await userWithUsername(t, 'target5')
    await expect(
      alice.user.mutation(api.friends.sendFriendRequest, { username: 'target5' }),
    ).rejects.toThrow(/rate/i)
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
    // Falls back to the username, never the email. This previously asserted
    // 'alice@test.local' — the test was pinning an email leak in place.
    expect(detail!.owner.displayName).toBe('alice')
    expect(detail!.owner.displayName).not.toContain('@')
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
    // Eve is a stranger here — a public opt-in shares the *workout*, not the
    // owner's email. This asserted 'alice@test.local' before, i.e. it pinned
    // "strangers can read your email address" as the expected behaviour.
    expect(detail!.owner.displayName).toBe('alice')
    expect(detail!.owner.displayName).not.toContain('@')
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

  // The "conquered" slash on a friend's workout has to be measured against
  // the OWNER's records. Getting the subject wrong here would both show the
  // wrong slashes and leak the viewer's PRs into someone else's page.
  it('returns the owner’s eligible records, never the viewer’s', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    // Alice PRs at 140, then logs a lighter session her own PR has left behind.
    await logWorkout(t, alice.user, exerciseId, 0, 140)
    const lighter = await logWorkout(t, alice.user, exerciseId, 0, 90)
    // Bob is much stronger — his record must not follow him onto Alice's page.
    await logWorkout(t, bob.user, exerciseId, 0, 200)

    const detail = await bob.user.query(api.friends.getFriendWorkoutDetail, {
      workoutId: lighter,
    })
    expect(detail!.eligibleRecords).toEqual([
      { exerciseId, bestWeightKg: 140, bestEst1rm: epley1rm(140, 5) },
    ])
  })

  it('a stranger with a public opt-in still gets no records leak', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const eve = await userWithUsername(t, 'eve')

    await logWorkout(t, alice.user, exerciseId, 0, 140)
    const lighter = await logWorkout(t, alice.user, exerciseId, 0, 90)
    await logWorkout(t, eve.user, exerciseId, 0, 200)

    // Gate still shut: no detail at all, so no records either.
    expect(
      await eve.user.query(api.friends.getFriendWorkoutDetail, { workoutId: lighter }),
    ).toBeNull()

    await alice.user.mutation(api.profiles.setWorkoutsPublic, { workoutsPublic: true })
    const detail = await eve.user.query(api.friends.getFriendWorkoutDetail, {
      workoutId: lighter,
    })
    expect(detail!.eligibleRecords).toEqual([
      { exerciseId, bestWeightKg: 140, bestEst1rm: epley1rm(140, 5) },
    ])
  })
})

describe('leaderboard', () => {
  // Wednesday of the current week, so a test can place workouts on earlier
  // days of the same Mon-Sun week without spilling into the previous one.
  const thisWeek = (dayOffset: number) => utcWeekStart(Date.now()) + dayOffset * DAY_MS + 12 * 3600_000
  const weekArgs = () => ({ period: 'week' as const, periodStartMs: utcWeekStart(Date.now()) })

  it('ranks three modest days above one huge day', async () => {
    // The assertion that proves the rework landed. Under the old formula this
    // was inverted: the score was raw kilograms, so Alice won comfortably and
    // the test said so in as many words.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    // Alice: one enormous session, nothing else.
    await logWorkoutOn(t, alice.user, exerciseId, { startedAt: thisWeek(0), weightKg: 200, reps: 20 })
    // Bob: three ordinary sessions on three different days.
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(0), weightKg: 50 })
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(1), weightKg: 50 })
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(2), weightKg: 50 })

    const board = await alice.user.query(api.friends.leaderboard, weekArgs())
    expect(board).toHaveLength(2)

    const aliceEntry = board.find((e) => e.username === 'alice')!
    const bobEntry = board.find((e) => e.username === 'bob')!
    expect(aliceEntry.daysTrained).toBe(1)
    expect(bobEntry.daysTrained).toBe(3)
    expect(bobEntry.points).toBeGreaterThan(aliceEntry.points)
    expect(board[0].username).toBe('bob')
  })

  it('reports the streak and tier alongside the score', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    // Bob trains this week and each of the two before it.
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(0) })
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(0) - WEEK_MS })
    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(0) - 2 * WEEK_MS })

    const board = await alice.user.query(api.friends.leaderboard, weekArgs())
    const bobEntry = board.find((e) => e.username === 'bob')!
    expect(bobEntry.streakWeeks).toBe(3)
    expect(bobEntry.tier).toBe('consistent')
    expect(bobEntry.streakCapped).toBe(false)
  })

  it('a points balance spent on a wager does not change the ranking', async () => {
    // The board measures training; the balance measures currency. Ranking on
    // earned rather than balance is what keeps those separate.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    await logWorkoutOn(t, bob.user, exerciseId, { startedAt: thisWeek(0) })
    const before = (await alice.user.query(api.friends.leaderboard, weekArgs())).find(
      (e) => e.username === 'bob',
    )!.points

    // Drain Bob's balance directly, as an escrow would.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', bob.userId))
        .unique()
      await ctx.db.patch(profile!._id, { pointsBalance: 0 })
    })

    const after = (await alice.user.query(api.friends.leaderboard, weekArgs())).find(
      (e) => e.username === 'bob',
    )!.points
    expect(after).toBe(before)
  })

  it('a month totals every week in it', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')

    // Two workouts in the same calendar month but different weeks. Anchored
    // to the 3rd and 17th so both always land inside one month.
    const now = new Date()
    const third = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 3, 12)
    const seventeenth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 17, 12)
    await logWorkoutOn(t, alice.user, exerciseId, { startedAt: third })
    await logWorkoutOn(t, alice.user, exerciseId, { startedAt: seventeenth })

    const board = await alice.user.query(api.friends.leaderboard, {
      period: 'month',
      periodStartMs: utcMonthStart(Date.now()),
    })
    expect(board[0].daysTrained).toBe(2)
    expect(board[0].points).toBeGreaterThan(0)
  })

  it('rejects a period start that is not a real boundary', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await expect(
      alice.user.query(api.friends.leaderboard, {
        period: 'week',
        periodStartMs: utcWeekStart(Date.now()) + DAY_MS,
      }),
    ).rejects.toThrow(/valid period/i)
  })

  it('rejects a period start in the future', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await expect(
      alice.user.query(api.friends.leaderboard, {
        period: 'week',
        periodStartMs: utcWeekStart(Date.now() + 30 * DAY_MS),
      }),
    ).rejects.toThrow(/future/i)
  })

  it('a solo user (no friends yet) sees just themselves', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const board = await alice.user.query(api.friends.leaderboard, weekArgs())
    expect(board).toHaveLength(1)
    expect(board[0].isMe).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  createBackend,
  createUser,
  givePoints,
  makeFriends,
  twoFriends,
  userWithUsername,
  type T,
} from './test.helpers'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function pointsOf(t: T, userId: Id<'users'>): Promise<number> {
  return await t.run(async (ctx) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    return profile?.pointsBalance ?? 0
  })
}

// Inserted directly (bypassing workouts.start/finish) — challenges.ts only
// reads startedAt/endedAt off `workouts`, so a bare row is enough.
async function insertFinishedWorkout(t: T, ownerId: Id<'users'>, startedAt: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert('workouts', { ownerId, name: 'Test', startedAt, endedAt: startedAt })
  })
}

describe('propose', () => {
  it("rejects challenging yourself", async () => {
    const t = createBackend()
    const { alice } = await twoFriends(t)
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: alice.userId,
        weeks: 2,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/yourself/i)
  })

  it('rate limits a burst of proposals from the same user', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await givePoints(t, alice.userId, 1000)
    const opponents = []
    for (let i = 0; i < 6; i++) {
      const opponent = await userWithUsername(t, `opponent${i}`)
      await makeFriends(t, alice.userId, opponent.userId)
      opponents.push(opponent)
    }

    // The 'challengePropose' token bucket (convex/rateLimiter.ts) has a
    // burst capacity of 5. A rejected proposal rolls back its own mutation
    // (Convex mutations are all-or-nothing), which undoes the token it
    // consumed — so this has to be a run of *successful* proposals, each
    // against a distinct opponent, to actually observe the limit.
    for (let i = 0; i < 5; i++) {
      await alice.user.mutation(api.challenges.propose, {
        opponentId: opponents[i].userId,
        weeks: 2,
        wagerPoints: 10,
      })
    }
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: opponents[5].userId,
        weeks: 2,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/rate/i)
  })

  it('rejects challenging a non-friend', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const carol = await userWithUsername(t, 'carol')
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: carol.userId,
        weeks: 2,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/only challenge friends/i)
  })

  it('rejects weeks/wager outside LIMITS bounds', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: bob.userId,
        weeks: 0,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/between/i)
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: bob.userId,
        weeks: 2,
        wagerPoints: 0,
      }),
    ).rejects.toThrow(/between/i)
  })

  it('fails without enough points, and does not create a challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: bob.userId,
        weeks: 2,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/not enough points/i)
    expect(await alice.user.query(api.challenges.getThread, { friendUserId: bob.userId })).toEqual(
      [],
    )
  })

  it('succeeds and escrows (debits) the wager from the challenger', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)

    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    expect(await pointsOf(t, alice.userId)).toBe(30)

    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge).toMatchObject({ status: 'pending', weeks: 2, wagerPoints: 20, isMine: true })
  })

  it('blocks a second open challenge with the same friend', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 100)
    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await expect(
      alice.user.mutation(api.challenges.propose, {
        opponentId: bob.userId,
        weeks: 1,
        wagerPoints: 10,
      }),
    ).rejects.toThrow(/already have an open challenge/i)
  })
})

describe('accept', () => {
  it('rejects a non-opponent', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const carol = await userWithUsername(t, 'carol')
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await expect(carol.user.mutation(api.challenges.accept, { challengeId })).rejects.toThrow(
      /not found/i,
    )
  })

  it('escrows the opponent and activates the challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    await givePoints(t, bob.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await bob.user.mutation(api.challenges.accept, { challengeId })
    expect(await pointsOf(t, bob.userId)).toBe(30)

    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge.status).toBe('active')
    expect(challenge.startedAt).toBeDefined()
    expect(challenge.endsAt).toBe(challenge.startedAt! + 2 * WEEK_MS)
  })

  it('leaves the challenge pending and the challenger escrow untouched if the opponent lacks points', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await expect(bob.user.mutation(api.challenges.accept, { challengeId })).rejects.toThrow(
      /not enough points/i,
    )
    expect(await pointsOf(t, alice.userId)).toBe(30) // still escrowed, unchanged
    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge.status).toBe('pending')
  })

  it('rejects accepting a non-pending challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    await givePoints(t, bob.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await bob.user.mutation(api.challenges.accept, { challengeId })

    await expect(bob.user.mutation(api.challenges.accept, { challengeId })).rejects.toThrow(
      /no longer pending/i,
    )
  })
})

describe('decline', () => {
  it('rejects a non-opponent', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const carol = await userWithUsername(t, 'carol')
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await expect(carol.user.mutation(api.challenges.decline, { challengeId })).rejects.toThrow(
      /not found/i,
    )
  })

  it('refunds the challenger and marks declined', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await bob.user.mutation(api.challenges.decline, { challengeId })
    expect(await pointsOf(t, alice.userId)).toBe(50)
    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge.status).toBe('declined')
  })
})

describe('cancel', () => {
  it('rejects a non-challenger', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await expect(bob.user.mutation(api.challenges.cancel, { challengeId })).rejects.toThrow(
      /not found/i,
    )
  })

  it('rejects cancelling a non-pending (already active) challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    await givePoints(t, bob.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })
    await bob.user.mutation(api.challenges.accept, { challengeId })

    await expect(alice.user.mutation(api.challenges.cancel, { challengeId })).rejects.toThrow(
      /can only cancel a pending/i,
    )
  })

  it('refunds the challenger for a still-pending challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 50)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 20,
    })

    await alice.user.mutation(api.challenges.cancel, { challengeId })
    expect(await pointsOf(t, alice.userId)).toBe(50)
    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge.status).toBe('cancelled')
  })
})

describe('resolveExpired', () => {
  async function activeChallenge(t: T, weeks = 2, wagerPoints = 20) {
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 100)
    await givePoints(t, bob.userId, 100)
    const challengeId = await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks,
      wagerPoints,
    })
    await bob.user.mutation(api.challenges.accept, { challengeId })
    return { alice, bob, challengeId }
  }

  it('pays the winner double the wager (challenger wins)', async () => {
    const t = createBackend()
    const { alice, bob, challengeId } = await activeChallenge(t)

    // Force the challenge window into the past (so resolveExpired is due)
    // and place it somewhere we can log workouts directly inside.
    const windowStart = Date.now() - 3 * WEEK_MS
    const windowEnd = windowStart + 2 * WEEK_MS // matches activeChallenge's `weeks: 2`
    await t.run(async (ctx) => {
      await ctx.db.patch(challengeId, { startedAt: windowStart, endsAt: windowEnd })
    })

    // Alice logs both weeks, Bob logs none.
    await insertFinishedWorkout(t, alice.userId, windowStart + 1000)
    await insertFinishedWorkout(t, alice.userId, windowStart + WEEK_MS + 1000)

    await t.mutation(internal.challenges.resolveExpired, {})

    expect(await pointsOf(t, alice.userId)).toBe(100 - 20 + 40) // stake back + bob's stake
    expect(await pointsOf(t, bob.userId)).toBe(100 - 20)
    const [resolved] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(resolved.status).toBe('resolved')
    expect(resolved.winnerId).toBe(alice.userId)
  })

  it('refunds each side its own wager on an exact tie', async () => {
    const t = createBackend()
    const { alice, bob, challengeId } = await activeChallenge(t)

    const windowStart = Date.now() - 3 * WEEK_MS
    const windowEnd = windowStart + 2 * WEEK_MS
    await t.run(async (ctx) => {
      await ctx.db.patch(challengeId, { startedAt: windowStart, endsAt: windowEnd })
    })
    // Neither side logs anything -> both streaks are 0 -> tie.

    await t.mutation(internal.challenges.resolveExpired, {})

    // Escrowed 20, then refunded 20 on the tie — net back to the starting 100.
    expect(await pointsOf(t, alice.userId)).toBe(100)
    expect(await pointsOf(t, bob.userId)).toBe(100)
    const [resolved] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(resolved.status).toBe('resolved')
    expect(resolved.winnerId).toBeUndefined()
  })

  it('does not touch a still-active (not yet due) challenge', async () => {
    const t = createBackend()
    const { alice, bob } = await activeChallenge(t)

    await t.mutation(internal.challenges.resolveExpired, {})

    const [challenge] = await alice.user.query(api.challenges.getThread, {
      friendUserId: bob.userId,
    })
    expect(challenge.status).toBe('active')
  })
})

describe('getThread', () => {
  it('requires sign-in returns empty', async () => {
    const t: T = createBackend()
    const someUserId = await createUser(t, 'ghost')
    expect(await t.query(api.challenges.getThread, { friendUserId: someUserId })).toEqual([])
  })
})

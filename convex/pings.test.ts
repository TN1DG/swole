import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  createBackend,
  makeFriends,
  twoFriends,
  userWithUsername,
  type T,
} from './test.helpers'

describe('send', () => {
  it('rate limits a burst of sends from the same user', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const friends = []
    for (let i = 0; i < 6; i++) {
      const friend = await userWithUsername(t, `friend${i}`)
      await makeFriends(t, alice.userId, friend.userId)
      friends.push(friend)
    }

    // The 'pingSend' token bucket (convex/rateLimiter.ts) has a burst
    // capacity of 5. A rejected send rolls back its own mutation (Convex
    // mutations are all-or-nothing), which undoes the token it consumed —
    // so this has to be a run of *successful* sends, each to a distinct
    // friend, to actually observe the limit.
    for (let i = 0; i < 5; i++) {
      await alice.user.mutation(api.pings.send, { toUserId: friends[i].userId })
    }
    await expect(
      alice.user.mutation(api.pings.send, { toUserId: friends[5].userId }),
    ).rejects.toThrow(/rate/i)
  })
})

describe('getAckPrompt / dismissPrompt', () => {
  it('is null with no pings at all', async () => {
    const t = createBackend()
    const { alice } = await twoFriends(t)
    expect(await alice.user.query(api.pings.getAckPrompt, {})).toBeNull()
  })

  it('is null while the ping is still unacknowledged', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    expect(await alice.user.query(api.pings.getAckPrompt, {})).toBeNull()
  })

  it('appears once the friend acknowledges', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    const prompt = await alice.user.query(api.pings.getAckPrompt, {})
    expect(prompt).toMatchObject({ pingId: ping._id, toUserId: bob.userId })
  })

  it('disappears once dismissed', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    await alice.user.mutation(api.pings.dismissPrompt, { pingId: ping._id })
    expect(await alice.user.query(api.pings.getAckPrompt, {})).toBeNull()
  })

  it('is null once a workout gets linked back to the ping', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    // Simulate the best-effort auto-link workouts.finish performs.
    await t.run(async (ctx) => {
      const workoutId = await ctx.db.insert('workouts', {
        ownerId: alice.userId,
        name: 'Morning Workout',
        startedAt: Date.now(),
        endedAt: Date.now(),
      })
      await ctx.db.patch(ping._id, { linkedWorkoutId: workoutId })
    })

    expect(await alice.user.query(api.pings.getAckPrompt, {})).toBeNull()
  })

  it('is null once the ping is more than 24h stale', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    await t.run(async (ctx) => {
      const DAY_MS = 24 * 60 * 60 * 1000
      await ctx.db.patch(ping._id, { sentAt: Date.now() - DAY_MS - 1 })
    })

    expect(await alice.user.query(api.pings.getAckPrompt, {})).toBeNull()
  })

  it('dismissPrompt rejects anyone but the sender', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })

    await expect(
      bob.user.mutation(api.pings.dismissPrompt, { pingId: ping._id }),
    ).rejects.toThrow(/not authorized/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    expect(await t.query(api.pings.getAckPrompt, {})).toBeNull()
  })
})

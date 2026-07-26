import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { asUser, createBackend, createUser, type T } from './test.helpers'

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

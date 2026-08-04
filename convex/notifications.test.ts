import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  makeFriends,
  userWithUsername,
  type T,
  deleteAccountAndPurge,
} from './test.helpers'

describe('friend request notifications', () => {
  it('notifies the recipient when a request arrives', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    expect(await bob.user.query(api.notifications.listUnread, {})).toMatchObject([
      { kind: 'friend_request_received', fromUserId: alice.userId, fromName: 'alice' },
    ])
    // The sender gets nothing yet — only the recipient.
    expect(await alice.user.query(api.notifications.listUnread, {})).toEqual([])
  })

  it('notifies the sender on accept and retires the recipient notice', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})
    await bob.user.mutation(api.friends.acceptFriendRequest, { requestId: incoming.requestId })

    expect(await alice.user.query(api.notifications.listUnread, {})).toMatchObject([
      { kind: 'friend_request_accepted', fromUserId: bob.userId },
    ])
    // Bob's "alice sent you a friend request" is stale now that he accepted
    // it from the Friends page rather than the banner.
    expect(await bob.user.query(api.notifications.listUnread, {})).toEqual([])
  })

  it('retires the recipient notice when the request is declined', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    const [incoming] = await bob.user.query(api.friends.myIncomingRequests, {})
    await bob.user.mutation(api.friends.declineFriendRequest, { requestId: incoming.requestId })

    expect(await bob.user.query(api.notifications.listUnread, {})).toEqual([])
    expect(await alice.user.query(api.notifications.listUnread, {})).toEqual([])
  })
})

describe('ping notifications', () => {
  it('notifies the recipient, carrying the pingId', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await makeFriends(t, alice.userId, bob.userId)

    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })

    const [notification] = await bob.user.query(api.notifications.listUnread, {})
    expect(notification).toMatchObject({
      kind: 'ping_received',
      fromUserId: alice.userId,
      fromName: 'alice',
    })
    // The banner needs this to acknowledge in one tap.
    expect(notification.pingId).not.toBeNull()
  })

  it('retires the notice once the ping is acknowledged', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await makeFriends(t, alice.userId, bob.userId)

    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await bob.user.query(api.pings.getThread, { friendUserId: alice.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    expect(await bob.user.query(api.notifications.listUnread, {})).toEqual([])
  })
})

describe('"won the battle" notification', () => {
  // Logs and finishes a one-set workout for `user`.
  async function finishWorkout(t: T, user: ReturnType<typeof asUser>) {
    const exerciseId = await createBuiltInExercise(t, `Bench ${Math.random()}`)
    const workoutId = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    const active = await user.query(api.workouts.getActive, {})
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id,
      weightKg: 60,
      reps: 5,
      completed: true,
    })
    return await user.mutation(api.workouts.finish, { workoutId })
  }

  it('tells the acknowledger when their pinger finishes a workout', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await makeFriends(t, alice.userId, bob.userId)

    // Alice pings, Bob holds her accountable, Alice actually goes and lifts.
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    const [ping] = await bob.user.query(api.pings.getThread, { friendUserId: alice.userId })
    await bob.user.mutation(api.pings.acknowledge, { pingId: ping._id })
    await finishWorkout(t, alice.user)

    expect(await bob.user.query(api.notifications.listUnread, {})).toMatchObject([
      { kind: 'workout_finished_after_ping', fromUserId: alice.userId, fromName: 'alice' },
    ])
  })

  it('stays silent when the ping was never acknowledged', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await makeFriends(t, alice.userId, bob.userId)

    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    await finishWorkout(t, alice.user)

    // Only the un-acknowledged ping notice — no "won the battle".
    const kinds = (await bob.user.query(api.notifications.listUnread, {})).map((n) => n.kind)
    expect(kinds).toEqual(['ping_received'])
  })
})

describe('sender naming', () => {
  it('prefers the display name', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await alice.user.mutation(api.profiles.updateDisplayName, { displayName: 'Alice A' })

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    expect((await bob.user.query(api.notifications.listUnread, {}))[0].fromName).toBe('Alice A')
  })

  // A friend-request notice names someone you haven't accepted yet, so it
  // must never surface their email address (unlike friends.ts's profileFor,
  // which does fall back to email for people you're already friends with).
  it('falls back to the username, never the email', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    const { fromName } = (await bob.user.query(api.notifications.listUnread, {}))[0]
    expect(fromName).toBe('alice')
    expect(fromName).not.toContain('@')
  })
})

describe('markRead', () => {
  it('removes a notification from the unread list', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    const [notification] = await bob.user.query(api.notifications.listUnread, {})
    await bob.user.mutation(api.notifications.markRead, { notificationId: notification._id })

    expect(await bob.user.query(api.notifications.listUnread, {})).toEqual([])
  })

  it("refuses to mark someone else's notification read", async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    const [notification] = await bob.user.query(api.notifications.listUnread, {})
    await expect(
      alice.user.mutation(api.notifications.markRead, { notificationId: notification._id }),
    ).rejects.toThrow(/not found/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    expect(await t.query(api.notifications.listUnread, {})).toEqual([])
  })
})

describe('account deletion', () => {
  it('clears notifications in both directions', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    // alice -> bob (bob receives one, referencing alice as sender)
    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })
    expect(await bob.user.query(api.notifications.listUnread, {})).toHaveLength(1)

    await deleteAccountAndPurge(t, alice.user)

    // Bob's notice pointed at a now-deleted sender; it should be gone rather
    // than rendering as "Someone".
    expect(await bob.user.query(api.notifications.listUnread, {})).toEqual([])
    const remaining = await t.run(async (ctx) => ctx.db.query('notifications').collect())
    expect(remaining).toEqual([])
  })
})

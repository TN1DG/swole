import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { chatRoomId } from './chatRoom'
import { isAllowedPushEndpoint, isExpiredPushStatus, queuePush } from './push'
import {
  asUser,
  createBackend,
  createUser,
  deleteAccountAndPurge,
  twoFriends,
  userWithUsername,
  type T,
} from './test.helpers'

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'
const subscription = (endpoint = ENDPOINT) => ({ endpoint, p256dh: 'key', auth: 'secret' })

const allSubscriptions = (t: T) =>
  t.run(async (ctx) => await ctx.db.query('pushSubscriptions').collect())

// What's been queued for the sender. Kept on fake timers so nothing actually
// tries to run it: pushSender.ts is a Node action and makes real network calls.
const queued = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect())
      .filter((job) => job.name.startsWith('pushSender'))
      .map((job) => job.args[0] as { userId: string; payload: Record<string, string> }),
  )

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://web.push.apple.com/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
  })

  // The sender requests this URL from our backend, so these would be server-side
  // request forgery rather than just bad data.
  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example.com/abc',
    'https://fcm.googleapis.com.evil.example.com/abc',
    'https://evil.example.com/fcm.googleapis.com/',
    'https://fcm.googleapis.com@evil.example.com/abc',
    'https://user:pass@fcm.googleapis.com/abc',
    'https://fcm.googleapis.com:8443/abc',
    'http://127.0.0.1:3210/api/x',
    'http://169.254.169.254/latest/meta-data',
    'not a url',
    '',
  ])('refuses %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
  })
})

describe('isExpiredPushStatus', () => {
  it('treats only 404 and 410 as gone', () => {
    expect(isExpiredPushStatus(404)).toBe(true)
    expect(isExpiredPushStatus(410)).toBe(true)
    expect(isExpiredPushStatus(429)).toBe(false)
    expect(isExpiredPushStatus(500)).toBe(false)
    expect(isExpiredPushStatus(undefined)).toBe(false)
  })
})

describe('subscribe', () => {
  it('saves a subscription, once', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.push.subscribe, subscription())
    await user.mutation(api.push.subscribe, subscription())

    expect(await allSubscriptions(t)).toHaveLength(1)
  })

  it('refuses an endpoint that is not a push service', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await expect(
      user.mutation(api.push.subscribe, subscription('https://evil.example.com/x')),
    ).rejects.toThrow(/unsupported push service/i)
    expect(await allSubscriptions(t)).toHaveLength(0)
  })

  it('hands a shared device to whoever subscribed it last', async () => {
    const t = createBackend()
    const aliceId = await createUser(t, 'alice')
    const bobId = await createUser(t, 'bob')

    await asUser(t, aliceId).mutation(api.push.subscribe, subscription())
    await asUser(t, bobId).mutation(api.push.subscribe, subscription())

    const subs = await allSubscriptions(t)
    expect(subs.map((s) => s.userId)).toEqual([bobId])
  })

  it('caps devices per person, dropping the oldest', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    for (let i = 0; i < 11; i++) {
      await user.mutation(api.push.subscribe, subscription(`${ENDPOINT}-${i}`))
    }

    const endpoints = (await allSubscriptions(t)).map((s) => s.endpoint)
    expect(endpoints).toHaveLength(10)
    expect(endpoints).not.toContain(`${ENDPOINT}-0`)
    expect(endpoints).toContain(`${ENDPOINT}-10`)
  })

  it('requires sign-in', async () => {
    const t = createBackend()
    await expect(t.mutation(api.push.subscribe, subscription())).rejects.toThrow(/not signed in/i)
  })
})

describe('unsubscribe', () => {
  it('removes your own subscription', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await user.mutation(api.push.subscribe, subscription())

    await user.mutation(api.push.unsubscribe, { endpoint: ENDPOINT })

    expect(await allSubscriptions(t)).toHaveLength(0)
  })

  it("can't remove someone else's", async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))
    await alice.mutation(api.push.subscribe, subscription())

    await bob.mutation(api.push.unsubscribe, { endpoint: ENDPOINT })

    expect(await allSubscriptions(t)).toHaveLength(1)
  })
})

describe('message pushes', () => {
  async function friendsWithSubscribedBob(t: T) {
    const friends = await twoFriends(t)
    await friends.bob.user.mutation(api.push.subscribe, subscription())
    return friends
  }

  it('queues nothing when the recipient has no devices', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'yo' })

    expect(await queued(t)).toEqual([])
  })

  it('names the sender, shows the text and opens the chat', async () => {
    const t = createBackend()
    const { alice, bob } = await friendsWithSubscribedBob(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'leg day at 6?' })

    expect(await queued(t)).toEqual([
      {
        userId: bob.userId,
        payload: {
          title: 'alice',
          body: 'leg day at 6?',
          url: `/friends/${alice.userId}/chat`,
          tag: `chat-${alice.userId}`,
        },
      },
    ])
  })

  it('leaves the text out when the recipient asked to hide it', async () => {
    const t = createBackend()
    const { alice, bob } = await friendsWithSubscribedBob(t)
    await bob.user.mutation(api.push.setHideMessageText, { hide: true })

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'private thing' })

    const [job] = await queued(t)
    expect(job!.payload.title).toBe('New message from alice')
    expect(JSON.stringify(job)).not.toContain('private thing')
  })

  it('describes a photo with no caption, and shortens long text', async () => {
    const t = createBackend()
    const { alice, bob } = await friendsWithSubscribedBob(t)
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(['x'])))

    await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: '',
      image: { storageId, width: 10, height: 10 },
    })
    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'x'.repeat(500) })

    const [photo, long] = await queued(t)
    expect(photo!.payload.body).toBe('📷 Photo')
    expect(long!.payload.body).toHaveLength(140)
  })

  it('stays quiet while the recipient has that chat on screen', async () => {
    const t = createBackend()
    const { alice, bob } = await friendsWithSubscribedBob(t)
    await bob.user.mutation(api.presence.heartbeat, {
      roomId: chatRoomId(alice.userId, bob.userId),
      userId: bob.userId,
      sessionId: 's1',
      interval: 10000,
    })

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'yo' })

    expect(await queued(t)).toEqual([])
  })

  it('still pushes when only the sender is in the room', async () => {
    const t = createBackend()
    const { alice, bob } = await friendsWithSubscribedBob(t)
    await alice.user.mutation(api.presence.heartbeat, {
      roomId: chatRoomId(alice.userId, bob.userId),
      userId: alice.userId,
      sessionId: 's1',
      interval: 10000,
    })

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'yo' })

    expect(await queued(t)).toHaveLength(1)
  })
})

describe('queuePush', () => {
  it('sends nothing across a block, in either direction', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.push.subscribe, subscription())
    await alice.user.mutation(api.push.subscribe, subscription(`${ENDPOINT}-2`))
    await bob.user.mutation(api.feed.blockUser, { userId: alice.userId })
    const payload = { title: 'hi', url: '/' }

    await t.run(async (ctx) => {
      await queuePush(ctx, { toUserId: bob.userId, fromUserId: alice.userId, payload })
      await queuePush(ctx, { toUserId: alice.userId, fromUserId: bob.userId, payload })
    })

    expect(await queued(t)).toEqual([])
  })
})

describe('notices become pushes', () => {
  it('covers a ping, opening the chat', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await bob.user.mutation(api.push.subscribe, subscription())

    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })

    expect((await queued(t))[0]!.payload).toMatchObject({
      title: 'alice pinged you 🏋️',
      url: `/friends/${alice.userId}/chat`,
    })
  })

  it('covers a friend request', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.push.subscribe, subscription())

    await alice.user.mutation(api.friends.sendFriendRequest, { username: 'bob' })

    expect((await queued(t))[0]!.payload).toMatchObject({
      title: 'alice sent you a friend request',
      url: '/friends?tab=chats',
    })
  })
})

describe('account deletion', () => {
  it("removes the account's devices", async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await user.mutation(api.push.subscribe, subscription())

    vi.useRealTimers() // deleteAccountAndPurge manages its own
    await deleteAccountAndPurge(t, user)

    expect(await allSubscriptions(t)).toHaveLength(0)
  })
})

describe('removeExpired', () => {
  it('deletes what the sender found was gone, and tolerates a repeat', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await user.mutation(api.push.subscribe, subscription())
    const [sub] = await allSubscriptions(t)

    await t.mutation(internal.push.removeExpired, { ids: [sub!._id] })
    await t.mutation(internal.push.removeExpired, { ids: [sub!._id] })

    expect(await allSubscriptions(t)).toHaveLength(0)
  })
})

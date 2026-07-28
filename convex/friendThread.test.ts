import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  createBackend,
  givePoints,
  twoFriends,
  userWithUsername,
  type T,
} from './test.helpers'

describe('messages.send', () => {
  it('delivers a message both sides can see in the thread', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'yo' })

    const mine = await alice.user.query(api.friendThread.getThread, { friendUserId: bob.userId })
    expect(mine).toMatchObject([{ type: 'message', isMine: true, message: { text: 'yo' } }])

    const theirs = await bob.user.query(api.friendThread.getThread, { friendUserId: alice.userId })
    expect(theirs).toMatchObject([{ type: 'message', isMine: false, message: { text: 'yo' } }])
  })

  it('refuses a non-friend', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const carol = await userWithUsername(t, 'carol')

    await expect(
      alice.user.mutation(api.messages.send, { toUserId: carol.userId, text: 'hi' }),
    ).rejects.toThrow(/only message friends/i)
  })

  it('refuses messaging yourself', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await expect(
      alice.user.mutation(api.messages.send, { toUserId: alice.userId, text: 'hi' }),
    ).rejects.toThrow(/yourself/i)
  })

  it('rejects blank and overlong text', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await expect(
      alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: '   ' }),
    ).rejects.toThrow(/required/i)
    await expect(
      alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'x'.repeat(1001) }),
    ).rejects.toThrow(/too long/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const bob = await userWithUsername(t, 'bob')
    await expect(
      t.mutation(api.messages.send, { toUserId: bob.userId, text: 'hi' }),
    ).rejects.toThrow(/not signed in/i)
  })

  // A non-friend can't read a thread either, but not because of an explicit
  // gate — every source query is scoped to the (me, them) pair, so there is
  // simply nothing to return.
  it('gives a stranger an empty thread', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const carol = await userWithUsername(t, 'carol')
    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'secret' })

    expect(
      await carol.user.query(api.friendThread.getThread, { friendUserId: alice.userId }),
    ).toEqual([])
  })
})

describe('unified thread ordering', () => {
  it('interleaves messages, pings and challenges chronologically', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 500)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'first' })
    await alice.user.mutation(api.pings.send, { toUserId: bob.userId })
    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 10,
    })
    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'last' })

    const thread = await alice.user.query(api.friendThread.getThread, { friendUserId: bob.userId })
    expect(thread.map((e) => e.type)).toEqual(['message', 'ping', 'challenge', 'message'])

    // Strictly non-decreasing timestamps, whatever the entry kind.
    const timestamps = thread.map((e) => e.ts)
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps)
  })

  // A challenge is one entry reflecting its current status, positioned at the
  // latest thing that happened to it — so resolving one surfaces it at the
  // bottom of the thread rather than leaving it buried where it was proposed.
  it('shows one entry per challenge, moved to when it was accepted', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 500)
    await givePoints(t, bob.userId, 500)

    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 10,
    })
    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'accept it!' })

    const before = await alice.user.query(api.friendThread.getThread, { friendUserId: bob.userId })
    expect(before.map((e) => e.type)).toEqual(['challenge', 'message'])

    const [challenge] = await bob.user.query(api.challenges.getThread, {
      friendUserId: alice.userId,
    })
    await bob.user.mutation(api.challenges.accept, { challengeId: challenge._id })

    const after = await alice.user.query(api.friendThread.getThread, { friendUserId: bob.userId })
    // Still one challenge entry, now sorted after the message (startedAt).
    expect(after.filter((e) => e.type === 'challenge')).toHaveLength(1)
    expect(after.map((e) => e.type)).toEqual(['message', 'challenge'])
  })
})

describe('unread tracking', () => {
  it('flags a friend who messaged me, and clears once I read the thread', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await bob.user.mutation(api.messages.send, { toUserId: alice.userId, text: 'hey' })
    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([bob.userId])

    await alice.user.mutation(api.friendThread.markRead, { friendUserId: bob.userId })
    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([])
  })

  it('does not flag my own outgoing messages', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'hi' })

    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([])
    // …but it IS unread for the recipient.
    expect(await bob.user.query(api.friendThread.unreadFriendIds, {})).toEqual([alice.userId])
  })

  it('re-flags when something new arrives after a read', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await bob.user.mutation(api.messages.send, { toUserId: alice.userId, text: 'one' })
    await alice.user.mutation(api.friendThread.markRead, { friendUserId: bob.userId })
    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([])

    await bob.user.mutation(api.messages.send, { toUserId: alice.userId, text: 'two' })
    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([bob.userId])
  })

  it('counts an incoming ping as unread too', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await bob.user.mutation(api.pings.send, { toUserId: alice.userId })
    expect(await alice.user.query(api.friendThread.unreadFriendIds, {})).toEqual([bob.userId])
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    expect(await t.query(api.friendThread.unreadFriendIds, {})).toEqual([])
  })
})

describe('account deletion', () => {
  it('removes messages in both directions and my read markers', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'mine' })
    await bob.user.mutation(api.messages.send, { toUserId: alice.userId, text: 'theirs' })
    await alice.user.mutation(api.friendThread.markRead, { friendUserId: bob.userId })

    await alice.user.mutation(api.account.deleteAccount, {})

    const remaining = await t.run(async (ctx) => ({
      messages: await ctx.db.query('messages').collect(),
      reads: await ctx.db.query('threadReads').collect(),
    }))
    expect(remaining.messages).toEqual([])
    expect(remaining.reads).toEqual([])
  })
})

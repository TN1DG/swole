import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  createBackend,
  givePoints,
  twoFriends,
  userWithUsername,
  type T,
  deleteAccountAndPurge,
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

    // Every one of those writes is stamped with `Date.now()`, and getThread's
    // sort has no tiebreak for equal timestamps — a stable sort then falls
    // back to insertion order (messages, pings, challenges), which puts the
    // challenge AFTER 'last'. On a fast runner all four land in the same
    // millisecond and this failed in CI on 2026-08-13. Space them out so the
    // assertion tests the chronological merge, not the clock's resolution.
    await t.run(async (ctx) => {
      const base = Date.now() - 60_000
      const messages = await ctx.db.query('messages').collect()
      const [ping] = await ctx.db.query('gymPings').collect()
      const [challenge] = await ctx.db.query('challenges').collect()

      await ctx.db.patch(messages.find((m) => m.text === 'first')!._id, { sentAt: base })
      await ctx.db.patch(ping._id, { sentAt: base + 1000 })
      await ctx.db.patch(challenge._id, { createdAt: base + 2000 })
      await ctx.db.patch(messages.find((m) => m.text === 'last')!._id, { sentAt: base + 3000 })
    })

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

    // Same clock hazard as the test above, and it bites harder here: on a tie
    // the stable sort emits messages before challenges, which is the exact
    // inverse of what this asserts. Pin both into the past — the accept below
    // then stamps `startedAt` at the real now, comfortably after the message,
    // so the reordering it causes is what the second assertion measures.
    await t.run(async (ctx) => {
      const base = Date.now() - 60_000
      const [proposed] = await ctx.db.query('challenges').collect()
      const [message] = await ctx.db.query('messages').collect()

      await ctx.db.patch(proposed._id, { createdAt: base })
      await ctx.db.patch(message._id, { sentAt: base + 1000 })
    })

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

    // unreadFriendIds compares `sentAt > lastReadAt` strictly, so a message
    // landing in the very millisecond of the markRead reads as already-seen.
    // All three writes here can share a millisecond on a fast runner (CI,
    // 2026-08-13). Pin 'one' and the read marker firmly in the past, so the
    // only thing that can flip the flag below is 'two' itself.
    await t.run(async (ctx) => {
      const now = Date.now()
      const messages = await ctx.db.query('messages').collect()
      const [read] = await ctx.db.query('threadReads').collect()

      await ctx.db.patch(messages.find((m) => m.text === 'one')!._id, { sentAt: now - 120_000 })
      await ctx.db.patch(read._id, { lastReadAt: now - 60_000 })
    })

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

    await deleteAccountAndPurge(t, alice.user)

    const remaining = await t.run(async (ctx) => ({
      messages: await ctx.db.query('messages').collect(),
      reads: await ctx.db.query('threadReads').collect(),
    }))
    expect(remaining.messages).toEqual([])
    expect(remaining.reads).toEqual([])
  })
})

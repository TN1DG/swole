import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { chatRoomId } from './chatRoom'
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

describe('lastActivity', () => {
  it('is empty with no activity, and requires sign-in', async () => {
    const t = createBackend()
    const { alice } = await twoFriends(t)

    expect(await alice.user.query(api.friendThread.lastActivity, {})).toEqual([])
    expect(await t.query(api.friendThread.lastActivity, {})).toEqual([])
  })

  it('picks a message over an older ping', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await bob.user.mutation(api.pings.send, { toUserId: alice.userId })
    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'hey' })

    // Same clock hazard the thread-ordering tests above call out: pin the
    // ping firmly in the past so the message is unambiguously newer.
    await t.run(async (ctx) => {
      const [ping] = await ctx.db.query('gymPings').collect()
      await ctx.db.patch(ping._id, { sentAt: Date.now() - 60_000 })
    })

    const activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([
      { friendId: bob.userId, kind: 'message', isMine: true, text: 'hey' },
    ])
  })

  it('picks a ping over an older message, reflecting direction and ack state', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'hey' })
    await bob.user.mutation(api.pings.send, { toUserId: alice.userId })

    await t.run(async (ctx) => {
      const [message] = await ctx.db.query('messages').collect()
      await ctx.db.patch(message._id, { sentAt: Date.now() - 60_000 })
    })

    let activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([
      { friendId: bob.userId, kind: 'ping', isMine: false, acknowledged: false },
    ])

    const [ping] = await alice.user.query(api.pings.getThread, { friendUserId: bob.userId })
    await alice.user.mutation(api.pings.acknowledge, { pingId: ping._id })

    activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([{ kind: 'ping', isMine: false, acknowledged: true }])

    // Same ping, seen from the sender's side.
    const bobActivity = await bob.user.query(api.friendThread.lastActivity, {})
    expect(bobActivity).toMatchObject([{ kind: 'ping', isMine: true, acknowledged: true }])
  })

  it('reflects a challenge through pending -> active -> resolved, ranked over older activity', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await givePoints(t, alice.userId, 500)
    await givePoints(t, bob.userId, 500)

    await alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: 'hi' })
    await alice.user.mutation(api.challenges.propose, {
      opponentId: bob.userId,
      weeks: 2,
      wagerPoints: 10,
    })

    await t.run(async (ctx) => {
      const [message] = await ctx.db.query('messages').collect()
      await ctx.db.patch(message._id, { sentAt: Date.now() - 60_000 })
    })

    let activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([
      { friendId: bob.userId, kind: 'challenge', isMine: true, status: 'pending', outcome: null },
    ])

    const [challenge] = await bob.user.query(api.challenges.getThread, { friendUserId: alice.userId })
    await bob.user.mutation(api.challenges.accept, { challengeId: challenge._id })

    activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([{ kind: 'challenge', status: 'active', outcome: null }])

    // Resolve with alice (the challenger) winning.
    await t.run(async (ctx) => {
      const [c] = await ctx.db.query('challenges').collect()
      await ctx.db.patch(c._id, { status: 'resolved', resolvedAt: Date.now(), winnerId: alice.userId })
    })

    activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([{ kind: 'challenge', status: 'resolved', outcome: 'won' }])
    expect(await bob.user.query(api.friendThread.lastActivity, {})).toMatchObject([
      { kind: 'challenge', status: 'resolved', outcome: 'lost' },
    ])

    // A tie: no winnerId at all.
    await t.run(async (ctx) => {
      const [c] = await ctx.db.query('challenges').collect()
      await ctx.db.patch(c._id, { winnerId: undefined })
    })
    activity = await alice.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject([{ kind: 'challenge', status: 'resolved', outcome: 'tied' }])
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

function photoBlob(sizeBytes = 64): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'image/webp' })
}
const storedFileCount = (t: T) =>
  t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)
const storePhoto = (t: T, size?: number) =>
  t.run(async (ctx) => await ctx.storage.store(photoBlob(size)))

describe('photo messages', () => {
  it('delivers a photo, with no caption needed, to both sides', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const storageId = await storePhoto(t)

    const result = await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: '  ',
      image: { storageId, width: 800, height: 600 },
    })
    expect(result).toEqual({ ok: true })

    const [entry] = await bob.user.query(api.friendThread.getThread, { friendUserId: alice.userId })
    expect(entry).toMatchObject({
      type: 'message',
      message: { text: '', imageWidth: 800, imageHeight: 600 },
    })
    if (entry?.type !== 'message') throw new Error('expected a message')
    expect(entry.message.imageUrl).toBeTruthy()
  })

  it('rejects an oversized photo and deletes the upload', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const storageId = await storePhoto(t, 1024 * 1024 + 1)

    const result = await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: 'look',
      image: { storageId, width: 800, height: 600 },
    })

    expect(result).toMatchObject({ ok: false })
    expect(await storedFileCount(t)).toBe(0)
    expect(await bob.user.query(api.friendThread.getThread, { friendUserId: alice.userId })).toEqual([])
  })

  it('frees the upload when the recipient is not a friend', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const carol = await userWithUsername(t, 'carol')
    const storageId = await storePhoto(t)

    const result = await alice.user.mutation(api.messages.send, {
      toUserId: carol.userId,
      text: '',
      image: { storageId, width: 800, height: 600 },
    })

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/only message friends/i) })
    expect(await storedFileCount(t)).toBe(0)
  })

  it('still requires text when there is no photo', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await expect(
      alice.user.mutation(api.messages.send, { toUserId: bob.userId, text: '' }),
    ).rejects.toThrow(/required/i)
  })

  it('previews a photo in lastActivity', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const storageId = await storePhoto(t)
    await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: '',
      image: { storageId, width: 800, height: 600 },
    })

    const [activity] = await bob.user.query(api.friendThread.lastActivity, {})
    expect(activity).toMatchObject({ kind: 'message', hasImage: true, text: '' })
  })

  it('frees chat photos when an account is deleted', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const fromAlice = await storePhoto(t)
    const fromBob = await storePhoto(t)
    await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: '',
      image: { storageId: fromAlice, width: 10, height: 10 },
    })
    await bob.user.mutation(api.messages.send, {
      toUserId: alice.userId,
      text: '',
      image: { storageId: fromBob, width: 10, height: 10 },
    })
    expect(await storedFileCount(t)).toBe(2)

    await deleteAccountAndPurge(t, alice.user)

    expect(await storedFileCount(t)).toBe(0)
  })
})

describe('messages.toggleReaction', () => {
  async function aMessage(t: T) {
    const friends = await twoFriends(t)
    await friends.alice.user.mutation(api.messages.send, { toUserId: friends.bob.userId, text: 'yo' })
    const messageId = await t.run(
      async (ctx) => (await ctx.db.query('messages').collect())[0]!._id,
    )
    const reactionsSeenBy = async (who: typeof friends.alice, friendUserId: typeof friends.bob.userId) => {
      const [entry] = await who.user.query(api.friendThread.getThread, { friendUserId })
      if (entry?.type !== 'message') throw new Error('expected a message')
      return entry.message.reactions
    }
    return { ...friends, messageId, reactionsSeenBy }
  }

  it('adds, replaces and removes one reaction per person', async () => {
    const t = createBackend()
    const { alice, bob, messageId, reactionsSeenBy } = await aMessage(t)

    await bob.user.mutation(api.messages.toggleReaction, { messageId, emoji: '🔥' })
    expect(await reactionsSeenBy(bob, alice.userId)).toEqual([{ emoji: '🔥', isMine: true }])
    expect(await reactionsSeenBy(alice, bob.userId)).toEqual([{ emoji: '🔥', isMine: false }])

    await bob.user.mutation(api.messages.toggleReaction, { messageId, emoji: '💪' })
    expect(await reactionsSeenBy(bob, alice.userId)).toEqual([{ emoji: '💪', isMine: true }])

    await bob.user.mutation(api.messages.toggleReaction, { messageId, emoji: '💪' })
    expect(await reactionsSeenBy(bob, alice.userId)).toEqual([])
  })

  it('keeps both people\'s reactions separate', async () => {
    const t = createBackend()
    const { alice, bob, messageId, reactionsSeenBy } = await aMessage(t)

    await alice.user.mutation(api.messages.toggleReaction, { messageId, emoji: '😂' })
    await bob.user.mutation(api.messages.toggleReaction, { messageId, emoji: '🔥' })

    expect(await reactionsSeenBy(alice, bob.userId)).toHaveLength(2)
  })

  it('rejects an emoji outside the allow-list', async () => {
    const t = createBackend()
    const { bob, messageId } = await aMessage(t)
    await expect(
      bob.user.mutation(api.messages.toggleReaction, { messageId, emoji: 'lol' }),
    ).rejects.toThrow(/unknown reaction/i)
  })

  it('refuses anyone outside the conversation', async () => {
    const t = createBackend()
    const { messageId } = await aMessage(t)
    const carol = await userWithUsername(t, 'carol')
    await expect(
      carol.user.mutation(api.messages.toggleReaction, { messageId, emoji: '🔥' }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('getThread limit', () => {
  async function threadOf(t: T, count: number) {
    const friends = await twoFriends(t)
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert('messages', {
          fromUserId: friends.alice.userId,
          toUserId: friends.bob.userId,
          text: String(i),
          sentAt: i + 1,
        })
      }
    })
    return friends
  }

  it('returns the newest entries, oldest first, defaulting to 60', async () => {
    const t = createBackend()
    const { alice, bob } = await threadOf(t, 70)

    const thread = await alice.user.query(api.friendThread.getThread, { friendUserId: bob.userId })

    expect(thread).toHaveLength(60)
    expect(thread.at(-1)).toMatchObject({ message: { text: '69' } })
  })

  it('reaches further back when asked', async () => {
    const t = createBackend()
    const { alice, bob } = await threadOf(t, 70)

    const thread = await alice.user.query(api.friendThread.getThread, {
      friendUserId: bob.userId,
      limit: 65,
    })

    expect(thread).toHaveLength(65)
    expect(thread[0]).toMatchObject({ message: { text: '5' } })
  })

  it.each([0, -5, Number.NaN])('survives a nonsense limit of %s', async (limit) => {
    const t = createBackend()
    const { alice, bob } = await threadOf(t, 3)
    const thread = await alice.user.query(api.friendThread.getThread, {
      friendUserId: bob.userId,
      limit,
    })
    expect(thread.length).toBeGreaterThan(0)
  })
})

describe('friendReadAt', () => {
  it("tells me when my friend last read, and never leaks to a stranger", async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const carol = await userWithUsername(t, 'carol')

    expect(await alice.user.query(api.friendThread.friendReadAt, { friendUserId: bob.userId })).toBeNull()

    await bob.user.mutation(api.friendThread.markRead, { friendUserId: alice.userId })

    expect(await alice.user.query(api.friendThread.friendReadAt, { friendUserId: bob.userId })).toEqual(
      expect.any(Number),
    )
    expect(await carol.user.query(api.friendThread.friendReadAt, { friendUserId: bob.userId })).toBeNull()
    // My own read marker isn't what "Read" means.
    expect(await bob.user.query(api.friendThread.friendReadAt, { friendUserId: alice.userId })).toBeNull()
  })
})

describe('blocking closes the channel', () => {
  it.each([
    ['the blocker', true],
    ['the blocked friend', false],
  ])('stops %s messaging, pinging and challenging', async (_label, senderIsBlocker) => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await bob.user.mutation(api.feed.blockUser, { userId: alice.userId })
    const [from, to] = senderIsBlocker ? [bob, alice] : [alice, bob]
    await givePoints(t, from.userId, 100)

    await expect(
      from.user.mutation(api.messages.send, { toUserId: to.userId, text: 'hi' }),
    ).rejects.toThrow(/couldn't be delivered/i)
    await expect(from.user.mutation(api.pings.send, { toUserId: to.userId })).rejects.toThrow(
      /couldn't be delivered/i,
    )
    await expect(
      from.user.mutation(api.challenges.propose, { opponentId: to.userId, weeks: 1, wagerPoints: 10 }),
    ).rejects.toThrow(/couldn't be delivered/i)
  })

  it('frees an already-uploaded photo', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await bob.user.mutation(api.feed.blockUser, { userId: alice.userId })
    const storageId = await storePhoto(t)

    const result = await alice.user.mutation(api.messages.send, {
      toUserId: bob.userId,
      text: '',
      image: { storageId, width: 10, height: 10 },
    })

    expect(result).toMatchObject({ ok: false })
    expect(await storedFileCount(t)).toBe(0)
  })
})

describe('presence', () => {
  const room = (a: string, b: string) => chatRoomId(a, b)

  it('lets friends join their room, and uses auth rather than the claimed user', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const roomId = room(alice.userId, bob.userId)

    const { roomToken } = await alice.user.mutation(api.presence.heartbeat, {
      roomId,
      userId: bob.userId, // lying about who this is
      sessionId: 's1',
      interval: 10000,
    })

    const present = await alice.user.query(api.presence.list, { roomToken })
    expect(present.map((p) => p.userId)).toEqual([alice.userId])
  })

  it('shows typing state through the room', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const { roomToken } = await alice.user.mutation(api.presence.heartbeat, {
      roomId: room(alice.userId, bob.userId),
      userId: alice.userId,
      sessionId: 's1',
      interval: 10000,
    })

    await alice.user.mutation(api.presence.setTyping, { friendUserId: bob.userId, typing: true })

    const [state] = await bob.user.query(api.presence.list, { roomToken })
    expect(state).toMatchObject({ userId: alice.userId, data: { typing: true } })
  })

  it("refuses a room you aren't in, a stranger's room, and malformed ids", async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    const carol = await userWithUsername(t, 'carol')
    const heartbeat = (user: typeof carol.user, roomId: string) =>
      user.mutation(api.presence.heartbeat, {
        roomId,
        userId: 'x',
        sessionId: 's1',
        interval: 10000,
      })

    await expect(heartbeat(carol.user, room(alice.userId, bob.userId))).rejects.toThrow(/not available/i)
    await expect(heartbeat(carol.user, room(carol.userId, alice.userId))).rejects.toThrow(/not available/i)
    await expect(heartbeat(alice.user, 'nonsense')).rejects.toThrow(/not available/i)
  })

  it('refuses a blocked friend', async () => {
    const t = createBackend()
    const { alice, bob } = await twoFriends(t)
    await bob.user.mutation(api.feed.blockUser, { userId: alice.userId })

    await expect(
      alice.user.mutation(api.presence.heartbeat, {
        roomId: room(alice.userId, bob.userId),
        userId: alice.userId,
        sessionId: 's1',
        interval: 10000,
      }),
    ).rejects.toThrow(/not available/i)
  })
})

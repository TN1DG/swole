import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { utcMonthStart, utcWeekStart, WEEK_MS } from './fitness'
import {
  createBackend,
  createBuiltInExercise,
  deleteAccountAndPurge,
  logWorkoutOn,
  userWithUsername,
  type T,
} from './test.helpers'

type User = Awaited<ReturnType<typeof userWithUsername>>

// alice founds a clan; everyone else listed joins it.
async function clan(t: T, ...names: string[]) {
  const alice = await userWithUsername(t, 'alice')
  const clanId = await alice.user.mutation(api.clans.create, { name: 'Iron Wolves' })
  const { inviteCode } = (await alice.user.query(api.clans.myClan, {
    monthStartMs: utcMonthStart(Date.now()),
  }))!
  const others: User[] = []
  for (const name of names) {
    const u = await userWithUsername(t, name)
    await u.user.mutation(api.clanChat.send, { text: 'x' }).catch(() => {}) // not a member yet
    await u.user.mutation(api.clans.joinByCode, { code: inviteCode })
    others.push(u)
  }
  return { alice, clanId, inviteCode, others }
}

const thread = async (u: User) => (await u.user.query(api.clanChat.getThread, {}))!

describe('membership gate', () => {
  it('refuses everything to someone outside the clan', async () => {
    const t = createBackend()
    await clan(t)
    const eve = await userWithUsername(t, 'eve')

    expect(await eve.user.query(api.clanChat.getThread, {})).toBeNull()
    expect(await eve.user.query(api.clanChat.leaderboard, { period: 'week', periodStartMs: utcWeekStart(Date.now()) })).toEqual([])
    await expect(eve.user.mutation(api.clanChat.send, { text: 'hi' })).rejects.toThrow(/not in a clan/)
    await expect(eve.user.mutation(api.clanChat.ping, {})).rejects.toThrow(/not in a clan/)
  })

  it('cuts access the moment a member leaves', async () => {
    const t = createBackend()
    const { others: [bob] } = await clan(t, 'bob')
    await bob!.user.mutation(api.clanChat.send, { text: 'hello' })
    await bob!.user.mutation(api.clans.leave, {})

    expect(await bob!.user.query(api.clanChat.getThread, {})).toBeNull()
    await expect(bob!.user.mutation(api.clanChat.send, { text: 'still here?' })).rejects.toThrow()
  })
})

describe('messages', () => {
  it('delivers to the whole clan with sender identity, and reacts', async () => {
    const t = createBackend()
    const { alice, others: [bob, cara] } = await clan(t, 'bob', 'cara')

    await bob!.user.mutation(api.clanChat.send, { text: 'Leg day?' })
    const seen = await thread(cara!)
    const msg = seen.entries.find((e) => e.type === 'message')!
    expect(msg).toMatchObject({ isMine: false, sender: { displayName: 'bob' } })

    if (msg.type !== 'message') throw new Error('unreachable')
    await alice.user.mutation(api.clanChat.toggleReaction, { messageId: msg.message._id, emoji: '💪' })
    const afterReact = (await thread(bob!)).entries.find((e) => e.type === 'message')!
    expect(afterReact.type === 'message' && afterReact.message.reactions).toEqual([{ emoji: '💪', isMine: false }])
  })

  it('frees a refused photo instead of orphaning it', async () => {
    const t = createBackend()
    const { alice } = await clan(t)
    // Over the 1MB ceiling, the same way friendThread.test.ts trips the check.
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/jpeg' })),
    )

    const result = await alice.user.mutation(api.clanChat.send, {
      text: '',
      image: { storageId, width: 10, height: 10 },
    })
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/image/) })
    expect(await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)).toBe(0)
  })

  it("hides messages from someone you've blocked", async () => {
    const t = createBackend()
    const { alice, others: [bob] } = await clan(t, 'bob')
    await bob!.user.mutation(api.clanChat.send, { text: 'spam' })
    await t.run(async (ctx) => {
      await ctx.db.insert('blockedUsers', { userId: alice.userId, blockedUserId: bob!.userId, createdAt: Date.now() })
    })
    expect((await thread(alice)).entries).toHaveLength(0)
    expect((await thread(bob!)).entries).toHaveLength(1)
  })
})

describe('pings', () => {
  it('pings the whole clan, and anyone can say they are going', async () => {
    const t = createBackend()
    const { alice, others: [bob, cara] } = await clan(t, 'bob', 'cara')

    await alice.user.mutation(api.clanChat.ping, {})
    const entry = (await thread(bob!)).entries.find((e) => e.type === 'ping')!
    if (entry.type !== 'ping') throw new Error('unreachable')
    expect(entry.ping).toMatchObject({ targets: null, canRespond: true })

    await bob!.user.mutation(api.clanChat.respondToPing, { pingId: entry.ping._id })
    await bob!.user.mutation(api.clanChat.respondToPing, { pingId: entry.ping._id }) // once only
    await cara!.user.mutation(api.clanChat.respondToPing, { pingId: entry.ping._id })

    const after = (await thread(alice)).entries.find((e) => e.type === 'ping')!
    expect(after.type === 'ping' && after.ping.going.map((g) => g.displayName)).toEqual(['bob', 'cara'])
  })

  it('pings only the picked members', async () => {
    const t = createBackend()
    const { alice, others: [bob, cara] } = await clan(t, 'bob', 'cara')

    await alice.user.mutation(api.clanChat.ping, { targetUserIds: [bob!.userId] })
    const forCara = (await thread(cara!)).entries.find((e) => e.type === 'ping')!
    if (forCara.type !== 'ping') throw new Error('unreachable')
    expect(forCara.ping).toMatchObject({ targets: ['bob'], canRespond: false })
    await expect(
      cara!.user.mutation(api.clanChat.respondToPing, { pingId: forCara.ping._id }),
    ).rejects.toThrow(/wasn't for you/)
    await bob!.user.mutation(api.clanChat.respondToPing, { pingId: forCara.ping._id })
  })

  it('refuses outsiders, yourself, and an empty pick as targets', async () => {
    const t = createBackend()
    const { alice } = await clan(t, 'bob')
    const eve = await userWithUsername(t, 'eve')

    await expect(alice.user.mutation(api.clanChat.ping, { targetUserIds: [eve.userId] })).rejects.toThrow(/members of your clan/)
    await expect(alice.user.mutation(api.clanChat.ping, { targetUserIds: [alice.userId] })).rejects.toThrow(/members of your clan/)
    await expect(alice.user.mutation(api.clanChat.ping, { targetUserIds: [] })).rejects.toThrow(/at least one/)
  })

  it('refuses a ping when nobody else is in the clan', async () => {
    const t = createBackend()
    const { alice } = await clan(t)
    await expect(alice.user.mutation(api.clanChat.ping, {})).rejects.toThrow(/Nobody else/)
  })

  it('is rate limited', async () => {
    const t = createBackend()
    const { alice } = await clan(t, 'bob')
    for (let i = 0; i < 3; i++) await alice.user.mutation(api.clanChat.ping, {})
    await expect(alice.user.mutation(api.clanChat.ping, {})).rejects.toThrow()
  })

  it('closes after 12 hours', async () => {
    const t = createBackend()
    const { alice, clanId, others: [bob] } = await clan(t, 'bob')
    const pingId = await t.run(async (ctx) =>
      ctx.db.insert('clanPings', { clanId, fromUserId: alice.userId, sentAt: Date.now() - 13 * 3600_000, goingUserIds: [] }),
    )
    await expect(bob!.user.mutation(api.clanChat.respondToPing, { pingId })).rejects.toThrow(/closed/)
  })
})

describe('leaderboard', () => {
  it("ranks members on this week's and this month's earned points", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, others: [bob] } = await clan(t, 'bob')
    await logWorkoutOn(t, bob!.user, exerciseId)

    const week = await alice.user.query(api.clanChat.leaderboard, { period: 'week', periodStartMs: utcWeekStart(Date.now()) })
    expect(week.map((e) => e.displayName)).toEqual(['bob', 'alice'])
    expect(week[0]!.points).toBeGreaterThan(0)
    const month = await alice.user.query(api.clanChat.leaderboard, { period: 'month', periodStartMs: utcMonthStart(Date.now()) })
    expect(month[0]!.points).toBe(week[0]!.points)
  })

  it('rejects a made-up period start', async () => {
    const t = createBackend()
    const { alice } = await clan(t)
    await expect(
      alice.user.query(api.clanChat.leaderboard, { period: 'week', periodStartMs: utcWeekStart(Date.now()) + 1 }),
    ).rejects.toThrow(/period start/)
  })
})

describe('weekly MVP', () => {
  const lastWeek = () => utcWeekStart(Date.now()) - WEEK_MS

  async function logLastWeek(t: T, u: User, exerciseId: Id<'exercises'>, days: number[]) {
    for (const d of days) await logWorkoutOn(t, u.user, exerciseId, { startedAt: lastWeek() + d * 86_400_000 + 3600_000 })
  }

  it("crowns last week's top earner, posts it, and counts it on the leaderboard", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, others: [bob] } = await clan(t, 'bob')
    await logLastWeek(t, bob!, exerciseId, [0, 1, 2])
    await logLastWeek(t, alice, exerciseId, [0])

    await t.mutation(internal.clanChat.awardWeeklyMvps, {})
    await t.mutation(internal.clanChat.awardWeeklyMvps, {}) // idempotent

    const mvps = (await thread(alice)).entries.filter((e) => e.type === 'mvp')
    expect(mvps).toHaveLength(1)
    expect(mvps[0]).toMatchObject({ winner: { displayName: 'bob' }, winnerIsMe: false })
    const board = await alice.user.query(api.clanChat.leaderboard, { period: 'week', periodStartMs: utcWeekStart(Date.now()) })
    expect(board.find((e) => e.displayName === 'bob')!.mvpCount).toBe(1)
  })

  it('crowns nobody in a week where nobody trained', async () => {
    const t = createBackend()
    const { alice } = await clan(t, 'bob')
    await t.mutation(internal.clanChat.awardWeeklyMvps, {})
    expect((await thread(alice)).entries).toHaveLength(0)
  })

  it('breaks a points tie on days trained, then on who joined first', async () => {
    const t = createBackend()
    const { alice, clanId, others: [bob] } = await clan(t, 'bob')
    // Equal points and days: the founder (alice) joined first.
    await t.run(async (ctx) => {
      for (const u of [alice, bob!]) {
        await ctx.db.insert('workouts', {
          ownerId: u.userId,
          name: 'W',
          startedAt: lastWeek() + 3600_000,
          endedAt: lastWeek() + 7200_000,
          pointsAwarded: 10,
        })
      }
    })
    await t.mutation(internal.clanChat.awardWeeklyMvps, {})
    const row = await t.run(async (ctx) =>
      ctx.db.query('clanWeeklyMvps').withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', clanId)).unique(),
    )
    expect(row!.userId).toBe(alice.userId)
  })

  it('keeps going across pages of clans', async () => {
    const t = createBackend()
    const userIds: Id<'users'>[] = []
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) {
        const userId = await ctx.db.insert('users', {})
        userIds.push(userId)
        const clanId = await ctx.db.insert('clans', {
          name: `C${i}`, nameLower: `c${i}`, leaderId: userId, inviteCode: `CODE${i}`, memberCount: 1, createdAt: 0,
        })
        await ctx.db.insert('clanMembers', { clanId, userId, joinedAt: 0 })
        await ctx.db.insert('workouts', {
          ownerId: userId, name: 'W', startedAt: lastWeek() + 3600_000, endedAt: lastWeek() + 7200_000, pointsAwarded: 5,
        })
      }
    })
    const { vi } = await import('vitest')
    vi.useFakeTimers()
    try {
      await t.mutation(internal.clanChat.awardWeeklyMvps, {})
      await t.finishAllScheduledFunctions(vi.runAllTimers)
    } finally {
      vi.useRealTimers()
    }
    const count = await t.run(async (ctx) => (await ctx.db.query('clanWeeklyMvps').collect()).length)
    expect(count).toBe(30)
  })
})

describe('read state', () => {
  it('shows unread until the chat is opened, and never for your own posts', async () => {
    const t = createBackend()
    const { alice, others: [bob] } = await clan(t, 'bob')

    await alice.user.mutation(api.clanChat.send, { text: 'yo' })
    expect((await alice.user.query(api.clanChat.overview, {}))!.unread).toBe(false)
    const bobView = (await bob!.user.query(api.clanChat.overview, {}))!
    expect(bobView).toMatchObject({ unread: true, last: { text: 'alice: yo' } })

    await bob!.user.mutation(api.clanChat.markRead, {})
    expect((await bob!.user.query(api.clanChat.overview, {}))!.unread).toBe(false)
  })
})

describe('cleanup', () => {
  it('empties the chat when the clan disbands', async () => {
    const t = createBackend()
    const { vi } = await import('vitest')
    const { alice } = await clan(t)
    await alice.user.mutation(api.clanChat.send, { text: 'last one out' })
    vi.useFakeTimers()
    try {
      await alice.user.mutation(api.clans.leave, {})
      await t.finishAllScheduledFunctions(vi.runAllTimers)
    } finally {
      vi.useRealTimers()
    }
    const left = await t.run(async (ctx) => ({
      messages: (await ctx.db.query('clanMessages').collect()).length,
      reads: (await ctx.db.query('clanReads').collect()).length,
    }))
    expect(left).toEqual({ messages: 0, reads: 0 })
  })

  it("removes a deleted account's messages and pings but keeps the clan's chat", async () => {
    const t = createBackend()
    const { alice, others: [bob] } = await clan(t, 'bob')
    await bob!.user.mutation(api.clanChat.send, { text: 'bye' })
    await bob!.user.mutation(api.clanChat.ping, {})
    await alice.user.mutation(api.clanChat.send, { text: 'stays' })

    await deleteAccountAndPurge(t, bob!.user)

    const entries = (await thread(alice)).entries
    expect(entries.map((e) => (e.type === 'message' ? e.message.text : e.type))).toEqual(['stays'])
  })
})

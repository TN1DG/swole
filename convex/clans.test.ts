import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { utcMonthStart, utcWeekStart, WEEK_MS } from './fitness'
import { reconcileWeek } from './points'
import { LIMITS } from './validation'
import {
  createBackend,
  createBuiltInExercise,
  deleteAccountAndPurge,
  givePoints,
  logWorkoutOn,
  userWithUsername,
  type T,
} from './test.helpers'

const month = () => utcMonthStart(Date.now())

async function seasonCp(t: T, clanId: Id<'clans'>, monthStart: number) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query('clanSeasons')
      .withIndex('by_clan_and_monthStart', (q) => q.eq('clanId', clanId).eq('monthStart', monthStart))
      .unique()
    return row?.cp ?? null
  })
}

async function clanWith(t: T) {
  const alice = await userWithUsername(t, 'alice')
  const clanId = await alice.user.mutation(api.clans.create, { name: 'Iron Wolves' })
  const mine = await alice.user.query(api.clans.myClan, { monthStartMs: month() })
  return { alice, clanId, code: mine!.inviteCode }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('create / join / leave', () => {
  it('founds a clan with the creator as its leader and only member', async () => {
    const t = createBackend()
    const { alice } = await clanWith(t)
    const mine = await alice.user.query(api.clans.myClan, { monthStartMs: month() })
    expect(mine).toMatchObject({ name: 'Iron Wolves', memberCount: 1, isLeader: true, cp: 0 })
    expect(mine!.members.map((m) => m.userId)).toEqual([alice.userId])
    expect(mine!.inviteCode).toMatch(/^[A-Z2-9]{8}$/)
  })

  it('rejects a duplicate name case-insensitively', async () => {
    const t = createBackend()
    await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await expect(bob.user.mutation(api.clans.create, { name: '  iron   WOLVES ' })).rejects.toThrow(
      /already exists/,
    )
  })

  it('joins by code, tolerating case and spacing', async () => {
    const t = createBackend()
    const { clanId, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code: ` ${code.toLowerCase()} ` })
    const mine = await bob.user.query(api.clans.myClan, { monthStartMs: month() })
    expect(mine).toMatchObject({ clanId, memberCount: 2, isLeader: false })
  })

  it('rejects an unknown code', async () => {
    const t = createBackend()
    const bob = await userWithUsername(t, 'bob')
    await expect(bob.user.mutation(api.clans.joinByCode, { code: 'ZZZZZZZZ' })).rejects.toThrow(
      /not valid/,
    )
  })

  it('allows only one clan per player', async () => {
    const t = createBackend()
    const { alice } = await clanWith(t)
    await expect(alice.user.mutation(api.clans.create, { name: 'Second' })).rejects.toThrow(
      /Leave your current clan/,
    )
  })

  it(`caps a clan at ${LIMITS.clanMaxMembers} members`, async () => {
    const t = createBackend()
    const { clanId, code } = await clanWith(t)
    await t.run(async (ctx) => {
      await ctx.db.patch(clanId, { memberCount: LIMITS.clanMaxMembers })
    })
    const bob = await userWithUsername(t, 'bob')
    await expect(bob.user.mutation(api.clans.joinByCode, { code })).rejects.toThrow(/full/)
  })

  it('allows joining only once per calendar month', async () => {
    const t = createBackend()
    const { code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code })
    await bob.user.mutation(api.clans.leave, {})
    await expect(bob.user.mutation(api.clans.joinByCode, { code })).rejects.toThrow(/one clan per month/)
    await expect(bob.user.mutation(api.clans.create, { name: 'Bobs' })).rejects.toThrow(
      /one clan per month/,
    )
  })

  it('a join from last month does not block this month', async () => {
    const t = createBackend()
    const { code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', bob.userId))
        .unique()
      await ctx.db.patch(profile!._id, { lastClanJoinAt: month() - 1 })
    })
    await bob.user.mutation(api.clans.joinByCode, { code })
  })

  it('hands leadership to the longest-standing member when the leader leaves', async () => {
    const t = createBackend()
    const { alice, clanId, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    const cara = await userWithUsername(t, 'cara')
    await bob.user.mutation(api.clans.joinByCode, { code })
    await cara.user.mutation(api.clans.joinByCode, { code })

    await alice.user.mutation(api.clans.leave, {})
    expect(await alice.user.query(api.clans.myClan, { monthStartMs: month() })).toBeNull()
    const clan = await t.run((ctx) => ctx.db.get(clanId))
    expect(clan).toMatchObject({ leaderId: bob.userId, memberCount: 2 })
  })

  it('disbands the clan, history and all, when the last member leaves', async () => {
    const t = createBackend()
    const { alice, clanId } = await clanWith(t)
    await alice.user.mutation(api.clans.leave, {})
    expect(await t.run((ctx) => ctx.db.get(clanId))).toBeNull()
    expect(await seasonCp(t, clanId, month())).toBeNull()
  })
})

describe('leader actions', () => {
  it('kicks a member without spending their monthly join', async () => {
    const t = createBackend()
    const { alice, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code })

    await alice.user.mutation(api.clans.kick, { userId: bob.userId })
    expect(await bob.user.query(api.clans.myClan, { monthStartMs: month() })).toBeNull()
    // Free to land somewhere else straight away.
    await bob.user.mutation(api.clans.create, { name: 'Bobs' })
  })

  it('refuses leader actions from a non-leader', async () => {
    const t = createBackend()
    const { alice, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code })

    await expect(bob.user.mutation(api.clans.kick, { userId: alice.userId })).rejects.toThrow(/leader/)
    await expect(bob.user.mutation(api.clans.rename, { name: 'Mine Now' })).rejects.toThrow(/leader/)
    await expect(bob.user.mutation(api.clans.rotateInviteCode, {})).rejects.toThrow(/leader/)
  })

  it('rotating the code kills the old one', async () => {
    const t = createBackend()
    const { alice, code } = await clanWith(t)
    const fresh = await alice.user.mutation(api.clans.rotateInviteCode, {})
    expect(fresh).not.toBe(code)
    const bob = await userWithUsername(t, 'bob')
    await expect(bob.user.mutation(api.clans.joinByCode, { code })).rejects.toThrow(/not valid/)
    await bob.user.mutation(api.clans.joinByCode, { code: fresh })
  })
})

describe('CP', () => {
  it("is the sum of every member's earned points this month", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, clanId, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code })

    await logWorkoutOn(t, alice.user, exerciseId)
    await logWorkoutOn(t, bob.user, exerciseId)

    const mine = await alice.user.query(api.clans.myClan, { monthStartMs: month() })
    const memberSum = mine!.members.reduce((s, m) => s + m.points, 0)
    expect(memberSum).toBeGreaterThan(0)
    expect(mine!.cp).toBe(memberSum)
    expect(await seasonCp(t, clanId, month())).toBe(memberSum)
  })

  it('drops again when a workout is deleted', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, clanId } = await clanWith(t)
    const workoutId = await logWorkoutOn(t, alice.user, exerciseId)
    expect(await seasonCp(t, clanId, month())).toBeGreaterThan(0)

    await alice.user.mutation(api.history.deleteWorkout, { workoutId })
    expect(await seasonCp(t, clanId, month())).toBe(0)
  })

  it("brings a joiner's points from earlier this month, and takes them when they leave", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { clanId, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await logWorkoutOn(t, bob.user, exerciseId)

    await bob.user.mutation(api.clans.joinByCode, { code })
    const withBob = await seasonCp(t, clanId, month())
    expect(withBob).toBeGreaterThan(0)

    await bob.user.mutation(api.clans.leave, {})
    expect(await seasonCp(t, clanId, month())).toBe(0)
  })

  it('ignores the points balance: challenge money and top-ups do not count', async () => {
    const t = createBackend()
    const { alice, clanId } = await clanWith(t)
    await givePoints(t, alice.userId, 500)
    const mine = await alice.user.query(api.clans.myClan, { monthStartMs: month() })
    expect(mine!.cp).toBe(0)
    expect(await seasonCp(t, clanId, month())).toBe(0)
  })

  it('updates both months when a scored week straddles a month boundary', async () => {
    const t = createBackend()
    const { alice, clanId } = await clanWith(t)

    // Find a week that crosses a month boundary, a few months back.
    let weekStart = utcWeekStart(Date.now()) - 20 * WEEK_MS
    while (utcMonthStart(weekStart) === utcMonthStart(weekStart + WEEK_MS - 1)) weekStart -= WEEK_MS
    const firstMonth = utcMonthStart(weekStart)
    const secondMonth = utcMonthStart(weekStart + WEEK_MS - 1)

    // One finished workout on each side of the boundary, unscored yet.
    await t.run(async (ctx) => {
      for (const startedAt of [weekStart + 1000, secondMonth + 1000]) {
        await ctx.db.insert('workouts', {
          ownerId: alice.userId,
          name: 'Workout',
          startedAt,
          endedAt: startedAt + 60_000,
        })
      }
      await reconcileWeek(ctx, alice.userId, weekStart)
    })

    expect(await seasonCp(t, clanId, firstMonth)).toBeGreaterThan(0)
    expect(await seasonCp(t, clanId, secondMonth)).toBeGreaterThan(0)
  })

  it('stops counting a member once their account is deleted', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, clanId, code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.joinByCode, { code })
    await logWorkoutOn(t, bob.user, exerciseId)
    expect(await seasonCp(t, clanId, month())).toBeGreaterThan(0)

    await deleteAccountAndPurge(t, bob.user)
    expect(await seasonCp(t, clanId, month())).toBe(0)
    const clan = await t.run((ctx) => ctx.db.get(clanId))
    expect(clan).toMatchObject({ memberCount: 1, leaderId: alice.userId })
  })

  it('disbands a solo clan when its only member deletes their account', async () => {
    const t = createBackend()
    const { alice, clanId } = await clanWith(t)
    await deleteAccountAndPurge(t, alice.user)
    expect(await t.run((ctx) => ctx.db.get(clanId))).toBeNull()
  })
})

describe('rankings', () => {
  it('orders clans by CP and exposes no members or codes', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    await bob.user.mutation(api.clans.create, { name: 'Bench Club' })
    await logWorkoutOn(t, bob.user, exerciseId)

    const board = await alice.user.query(api.clans.rankings, { monthStartMs: month() })
    expect(board.map((r) => r.name)).toEqual(['Bench Club', 'Iron Wolves'])
    expect(board[1]).toMatchObject({ isMine: true, cp: 0 })
    const json = JSON.stringify(board)
    expect(json).not.toContain(bob.userId)
    expect(json).not.toContain('inviteCode')

    const mine = await bob.user.query(api.clans.myClan, { monthStartMs: month() })
    expect(mine!.rank).toBe(1)
  })

  it('rejects a month start that is not a real month start', async () => {
    const t = createBackend()
    const bob = await userWithUsername(t, 'bob')
    await expect(
      bob.user.query(api.clans.rankings, { monthStartMs: month() + 1 }),
    ).rejects.toThrow(/month start/)
  })

  it('previews an invite without revealing members', async () => {
    const t = createBackend()
    const { code } = await clanWith(t)
    const bob = await userWithUsername(t, 'bob')
    const preview = await bob.user.query(api.clans.previewByCode, { code })
    expect(preview).toEqual({
      name: 'Iron Wolves',
      memberCount: 1,
      maxMembers: LIMITS.clanMaxMembers,
      isFull: false,
      alreadyMember: false,
      inOtherClan: false,
    })
    expect(await bob.user.query(api.clans.previewByCode, { code: 'nope' })).toBeNull()
  })
})

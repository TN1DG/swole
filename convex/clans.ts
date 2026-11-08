import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { utcMonthEnd, utcMonthStart } from './fitness'
import { finishedWorkoutsBetween, refreshClanSeason, summarizePeriod } from './points'
import { getOrCreateProfile } from './profiles'
import { rateLimiter, requireWriter } from './rateLimiter'
import { cleanClanName, LIMITS } from './validation'
import { profileForWithAvatar } from './friends'
import { internal } from './_generated/api'
import { presenceComponent } from './presence'
import { clanRoomId } from './chatRoom'

// Clans: up to LIMITS.clanMaxMembers players pooling their CP.
//
// CP is Swole Points EARNED (workouts.pointsAwarded), never the balance — the
// same rule as friends.leaderboard, so wagering or winning a challenge can't
// move a clan's standing. A clan's CP for a month is what its CURRENT members
// earned that month, maintained by points.ts:refreshClanSeason.
//
// Because your month's points travel with you, joining is limited to once per
// calendar month (profiles.lastClanJoinAt). Without that, one strong player
// could carry the same month of training through clan after clan.
//
// Membership is by invite code only. There is no directory: the rankings show
// clan names and totals, never who is in them.

// How far down the month's standings a rank is looked up. Past this, the UI
// shows "N+" rather than reading every clan in the game to place one.
const RANK_SCAN_LIMIT = 200
const RANKINGS_SHOWN = 50

// No 0/O or 1/I/L, so a code read aloud or off a screenshot survives.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32)
}

async function uniqueInviteCode(ctx: MutationCtx): Promise<string> {
  // ~10^11 codes, so a collision is vanishingly rare; the loop is for
  // correctness, not because it's expected to run twice.
  for (;;) {
    const code = randomCode()
    const taken = await ctx.db
      .query('clans')
      .withIndex('by_inviteCode', (q) => q.eq('inviteCode', code))
      .first()
    if (!taken) return code
  }
}

async function membershipOf(ctx: QueryCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('clanMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

async function clanByCode(ctx: QueryCtx, rawCode: string) {
  const code = normalizeCode(rawCode)
  if (code.length !== CODE_LENGTH) return null
  return await ctx.db
    .query('clans')
    .withIndex('by_inviteCode', (q) => q.eq('inviteCode', code))
    .unique()
}

async function assertNameFree(ctx: MutationCtx, nameLower: string, exceptId?: Id<'clans'>) {
  const clash = await ctx.db
    .query('clans')
    .withIndex('by_nameLower', (q) => q.eq('nameLower', nameLower))
    .first()
  if (clash && clash._id !== exceptId) throw new ConvexError('A clan with that name already exists')
}

// Auth, the blanket write budget, and the clan-specific limit.
async function requireClanWriter(ctx: MutationCtx): Promise<Id<'users'>> {
  const userId = await requireWriter(ctx)
  await rateLimiter.limit(ctx, 'clanWrite', { key: userId, throws: true })
  return userId
}

async function assertCanJoinThisMonth(ctx: MutationCtx, userId: Id<'users'>, now: number) {
  const profile = await getOrCreateProfile(ctx, userId)
  if (profile.lastClanJoinAt !== undefined && profile.lastClanJoinAt >= utcMonthStart(now)) {
    throw new ConvexError('You can only join one clan per month. Try again next month.')
  }
  return profile
}

async function requireLeader(ctx: MutationCtx, userId: Id<'users'>) {
  const membership = await membershipOf(ctx, userId)
  if (!membership) throw new ConvexError('You are not in a clan')
  const clan = (await ctx.db.get(membership.clanId))!
  if (clan.leaderId !== userId) throw new ConvexError('Only the clan leader can do that')
  return clan
}

/**
 * Takes `userId` out of their clan, handing leadership on or disbanding the
 * clan as needed, then re-derives this month's CP. No-op if not in one.
 *
 * Shared by leave, kick and account deletion so the three can't disagree
 * about what "gone" means.
 */
export async function removeFromClan(ctx: MutationCtx, userId: Id<'users'>, now: number) {
  const membership = await membershipOf(ctx, userId)
  if (!membership) return
  const clan = (await ctx.db.get(membership.clanId))!
  await ctx.db.delete(membership._id)
  // Their place in the chat goes with them; the chat itself stays.
  const read = await ctx.db
    .query('clanReads')
    .withIndex('by_userId_and_clanId', (q) => q.eq('userId', userId).eq('clanId', clan._id))
    .unique()
  if (read) await ctx.db.delete(read._id)
  await presenceComponent.removeRoomUser(ctx, clanRoomId(clan._id), userId)

  if (clan.memberCount <= 1) {
    await disband(ctx, clan)
    return
  }

  const patch: Partial<Doc<'clans'>> = { memberCount: clan.memberCount - 1 }
  if (clan.leaderId === userId) {
    // Longest-standing remaining member inherits the clan.
    const successor = await ctx.db
      .query('clanMembers')
      .withIndex('by_clan_and_joinedAt', (q) => q.eq('clanId', clan._id))
      .first()
    if (successor) patch.leaderId = successor.userId
  }
  await ctx.db.patch(clan._id, patch)
  await refreshClanSeason(ctx, clan._id, utcMonthStart(now))
}

async function disband(ctx: MutationCtx, clan: Doc<'clans'>) {
  // One row per month the clan existed, so this is small.
  const seasons = await ctx.db
    .query('clanSeasons')
    .withIndex('by_clan_and_monthStart', (q) => q.eq('clanId', clan._id))
    .take(1000)
  for (const s of seasons) await ctx.db.delete(s._id)
  await ctx.db.delete(clan._id)
  // The chat can be long, so it's emptied in batches of its own.
  await ctx.scheduler.runAfter(0, internal.clanChat.purgeClanChat, { clanId: clan._id })
}

function canonicalMonthStart(monthStartMs: number) {
  // Same reasoning as friends.leaderboard: the client passes the period start
  // so the query re-runs when the month rolls over, but it can't invent one.
  if (monthStartMs !== utcMonthStart(monthStartMs)) {
    throw new ConvexError('Not a valid month start')
  }
  return monthStartMs
}

// ---------- mutations ----------

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireClanWriter(ctx)
    const now = Date.now()
    if (await membershipOf(ctx, userId)) throw new ConvexError('Leave your current clan first')

    const name = cleanClanName(args.name)
    const nameLower = name.toLowerCase()
    await assertNameFree(ctx, nameLower)
    const profile = await assertCanJoinThisMonth(ctx, userId, now)

    const clanId = await ctx.db.insert('clans', {
      name,
      nameLower,
      leaderId: userId,
      inviteCode: await uniqueInviteCode(ctx),
      memberCount: 1,
      createdAt: now,
    })
    await ctx.db.insert('clanMembers', { clanId, userId, joinedAt: now })
    await ctx.db.patch(profile._id, { lastClanJoinAt: now })
    await refreshClanSeason(ctx, clanId, utcMonthStart(now))
    return clanId
  },
})

export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireClanWriter(ctx)
    const now = Date.now()
    if (await membershipOf(ctx, userId)) throw new ConvexError('Leave your current clan first')

    const clan = await clanByCode(ctx, args.code)
    if (!clan) throw new ConvexError('That invite code is not valid')
    if (clan.memberCount >= LIMITS.clanMaxMembers) throw new ConvexError('That clan is full')
    const profile = await assertCanJoinThisMonth(ctx, userId, now)

    await ctx.db.insert('clanMembers', { clanId: clan._id, userId, joinedAt: now })
    await ctx.db.patch(clan._id, { memberCount: clan.memberCount + 1 })
    await ctx.db.patch(profile._id, { lastClanJoinAt: now })
    await refreshClanSeason(ctx, clan._id, utcMonthStart(now))
    return clan._id
  },
})

export const leave = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireClanWriter(ctx)
    if (!(await membershipOf(ctx, userId))) throw new ConvexError('You are not in a clan')
    await removeFromClan(ctx, userId, Date.now())
  },
})

export const kick = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const callerId = await requireClanWriter(ctx)
    const clan = await requireLeader(ctx, callerId)
    if (args.userId === callerId) throw new ConvexError('Use Leave to leave your own clan')
    const target = await membershipOf(ctx, args.userId)
    if (!target || target.clanId !== clan._id) throw new ConvexError('Not a member of your clan')

    await removeFromClan(ctx, args.userId, Date.now())
    // Being removed isn't the player's choice, so it doesn't spend their one
    // join for the month.
    const profile = await getOrCreateProfile(ctx, args.userId)
    await ctx.db.patch(profile._id, { lastClanJoinAt: undefined })
  },
})

export const rename = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireClanWriter(ctx)
    const clan = await requireLeader(ctx, userId)
    const name = cleanClanName(args.name)
    const nameLower = name.toLowerCase()
    await assertNameFree(ctx, nameLower, clan._id)
    await ctx.db.patch(clan._id, { name, nameLower })
  },
})

// Invalidates the old code (and every link shared with it).
export const rotateInviteCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireClanWriter(ctx)
    const clan = await requireLeader(ctx, userId)
    const inviteCode = await uniqueInviteCode(ctx)
    await ctx.db.patch(clan._id, { inviteCode })
    return inviteCode
  },
})

// ---------- queries ----------

// Your clan this month, or null. Member identities are only ever returned
// here, to people already in the clan.
export const myClan = query({
  args: { monthStartMs: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const monthStart = canonicalMonthStart(args.monthStartMs)
    const monthEnd = utcMonthEnd(monthStart)

    const membership = await membershipOf(ctx, userId)
    if (!membership) return null
    const clan = await ctx.db.get(membership.clanId)
    if (!clan) return null

    const memberRows = await ctx.db
      .query('clanMembers')
      .withIndex('by_clan_and_joinedAt', (q) => q.eq('clanId', clan._id))
      .take(LIMITS.clanMaxMembers)

    const members = await Promise.all(
      memberRows.map(async (m) => {
        const [info, workouts] = await Promise.all([
          profileForWithAvatar(ctx, m.userId),
          finishedWorkoutsBetween(ctx, m.userId, monthStart, monthEnd),
        ])
        const { points, daysTrained } = summarizePeriod(workouts)
        return {
          ...info,
          points,
          daysTrained,
          isMe: m.userId === userId,
          isLeader: m.userId === clan.leaderId,
        }
      }),
    )
    members.sort((a, b) => b.points - a.points || b.daysTrained - a.daysTrained)

    // CP is the stored season total, so it agrees exactly with the rankings.
    const season = await ctx.db
      .query('clanSeasons')
      .withIndex('by_clan_and_monthStart', (q) =>
        q.eq('clanId', clan._id).eq('monthStart', monthStart),
      )
      .unique()

    let rank: number | null = null
    if (season) {
      const ahead = await ctx.db
        .query('clanSeasons')
        .withIndex('by_monthStart_and_cp', (q) => q.eq('monthStart', monthStart))
        .order('desc')
        .take(RANK_SCAN_LIMIT)
      const i = ahead.findIndex((s) => s._id === season._id)
      rank = i === -1 ? null : i + 1
    }

    const isLeader = clan.leaderId === userId
    return {
      clanId: clan._id,
      name: clan.name,
      memberCount: clan.memberCount,
      maxMembers: LIMITS.clanMaxMembers,
      inviteCode: clan.inviteCode,
      isLeader,
      cp: season?.cp ?? 0,
      // null with cp > 0 means "below the scanned window", shown as N+.
      rank,
      rankScanLimit: RANK_SCAN_LIMIT,
      members,
    }
  },
})

// This month's top clans. Names and totals only: no members, no codes.
export const rankings = query({
  args: { monthStartMs: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const monthStart = canonicalMonthStart(args.monthStartMs)
    const membership = await membershipOf(ctx, userId)

    const seasons = await ctx.db
      .query('clanSeasons')
      .withIndex('by_monthStart_and_cp', (q) => q.eq('monthStart', monthStart))
      .order('desc')
      .take(RANKINGS_SHOWN)

    const rows = await Promise.all(
      seasons.map(async (s) => {
        const clan = await ctx.db.get(s.clanId)
        if (!clan) return null
        return {
          clanId: clan._id,
          name: clan.name,
          memberCount: clan.memberCount,
          cp: s.cp,
          isMine: membership?.clanId === clan._id,
        }
      }),
    )
    return rows.filter((r) => r !== null)
  },
})

// What an invite link points at, for the join screen. A query, so it isn't
// rate limited: guessing codes is hopeless (31^8 ≈ 8.5e11) and a hit reveals
// only a name and a head count.
export const previewByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const clan = await clanByCode(ctx, args.code)
    if (!clan) return null
    const membership = await membershipOf(ctx, userId)
    return {
      name: clan.name,
      memberCount: clan.memberCount,
      maxMembers: LIMITS.clanMaxMembers,
      isFull: clan.memberCount >= LIMITS.clanMaxMembers,
      alreadyMember: membership?.clanId === clan._id,
      inOtherClan: membership !== null && membership.clanId !== clan._id,
    }
  },
})

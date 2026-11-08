import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { cleanText, LIMITS } from './validation'
import { rateLimiter, requireWriter } from './rateLimiter'
import { REACTION_EMOJIS } from './constants'
import { checkMessagePhoto, type MessagePhotoFields } from './messages'
import { queueClanMessagePush, queuePush } from './push'
import { presenceComponent } from './presence'
import { clanRoomId } from './chatRoom'
import { profileForWithAvatar } from './friends'
import { publicIdentity } from './identity'
import { finishedWorkoutsBetween, summarizePeriod } from './points'
import {
  utcMonthEnd,
  utcMonthStart,
  utcWeekEnd,
  utcWeekStart,
  WEEK_MS,
} from './fitness'

// A clan's group chat: messages, gym pings, and the weekly race's MVP posts in
// one thread, plus the in-chat leaderboard.
//
// Every gate is CURRENT membership of the clan (clanMembers.by_user). Members
// joined by invite code and needn't be friends, so friendship is never checked
// — and leaving or being kicked cuts access immediately.

const THREAD_ENTRIES = 60
// A ping is an invitation for today; after this it can't be answered.
const PING_OPEN_MS = 12 * 60 * 60 * 1000
const MVPS_SHOWN = 26

async function membershipOf(ctx: QueryCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('clanMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
}

async function membersOf(ctx: QueryCtx, clanId: Id<'clans'>) {
  return await ctx.db
    .query('clanMembers')
    .withIndex('by_clan_and_joinedAt', (q) => q.eq('clanId', clanId))
    .take(LIMITS.clanMaxMembers)
}

/** The caller's clan, for a query. null when signed out or clanless. */
async function myClanForRead(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx)
  if (userId === null) return null
  const membership = await membershipOf(ctx, userId)
  if (!membership) return null
  const clan = await ctx.db.get(membership.clanId)
  return clan ? { userId, clan } : null
}

/** The caller's clan, for a mutation: auth + write budget, or throws. */
async function requireClanMember(ctx: MutationCtx) {
  const userId = await requireWriter(ctx)
  const membership = await membershipOf(ctx, userId)
  const clan = membership ? await ctx.db.get(membership.clanId) : null
  if (!clan) throw new ConvexError('You are not in a clan')
  return { userId, clan }
}

async function blockedByMe(ctx: QueryCtx, userId: Id<'users'>): Promise<Set<Id<'users'>>> {
  const rows = await ctx.db
    .query('blockedUsers')
    .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
    .take(500)
  return new Set(rows.map((r) => r.blockedUserId))
}

// One identity read per distinct person in the thread, not per entry.
function identityCache(ctx: QueryCtx) {
  const cache = new Map<Id<'users'>, ReturnType<typeof profileForWithAvatar>>()
  return (userId: Id<'users'>) => {
    let hit = cache.get(userId)
    if (!hit) {
      hit = profileForWithAvatar(ctx, userId)
      cache.set(userId, hit)
    }
    return hit
  }
}

function canonicalPeriodStart(period: 'week' | 'month', startMs: number) {
  const canonical = period === 'week' ? utcWeekStart(startMs) : utcMonthStart(startMs)
  if (startMs !== canonical) throw new ConvexError('Not a valid period start')
  return startMs
}

// ---------- messages ----------

/** See messages.send — same `{ok:false}` contract, so a refused photo is freed. */
export const send = mutation({
  args: {
    text: v.string(),
    image: v.optional(
      v.object({ storageId: v.id('_storage'), width: v.number(), height: v.number() }),
    ),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; error: string }> => {
    const userId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'messageSend', { key: userId, throws: true })

    const refuse = async (error: string) => {
      if (!args.image) throw new ConvexError(error)
      await ctx.storage.delete(args.image.storageId)
      return { ok: false as const, error }
    }

    const membership = await membershipOf(ctx, userId)
    const clan = membership ? await ctx.db.get(membership.clanId) : null
    if (!clan) return await refuse('You are not in a clan')

    const text =
      args.image && !args.text.trim()
        ? ''
        : cleanText(args.text, LIMITS.messageMaxLength, 'Message')

    let image: MessagePhotoFields | null = null
    if (args.image) {
      const checked = await checkMessagePhoto(ctx, args.image)
      if ('missing' in checked) return { ok: false, error: checked.missing }
      if ('refused' in checked) return await refuse(checked.refused)
      image = checked.fields
    }

    const sentAt = Date.now()
    await ctx.db.insert('clanMessages', { clanId: clan._id, fromUserId: userId, text, sentAt, ...image })
    await markReadAt(ctx, userId, clan._id, sentAt)

    for (const m of await membersOf(ctx, clan._id)) {
      if (m.userId === userId) continue
      await queueClanMessagePush(ctx, {
        toUserId: m.userId,
        fromUserId: userId,
        clanId: clan._id,
        clanName: clan.name,
        text,
        hasImage: image !== null,
      })
    }
    return { ok: true }
  },
})

export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireClanMember(ctx)
    await rateLimiter.limit(ctx, 'messagePhotoUploadUrl', { key: userId, throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

// One reaction per person per message, as in 1:1 chat.
export const toggleReaction = mutation({
  args: { messageId: v.id('clanMessages'), emoji: v.string() },
  handler: async (ctx, args) => {
    const { userId, clan } = await requireClanMember(ctx)
    await rateLimiter.limit(ctx, 'messageReact', { key: userId, throws: true })
    if (!(REACTION_EMOJIS as readonly string[]).includes(args.emoji)) {
      throw new ConvexError('Unknown reaction')
    }
    const message = await ctx.db.get(args.messageId)
    if (!message || message.clanId !== clan._id) throw new ConvexError('Message not found')

    const existing = message.reactions ?? []
    const mine = existing.find((r) => r.userId === userId)
    const others = existing.filter((r) => r.userId !== userId)
    await ctx.db.patch(message._id, {
      reactions: mine?.emoji === args.emoji ? others : [...others, { userId, emoji: args.emoji }],
    })
  },
})

// ---------- pings ----------

// The whole clan (omit targetUserIds) or picked clanmates.
export const ping = mutation({
  args: { targetUserIds: v.optional(v.array(v.id('users'))) },
  handler: async (ctx, args) => {
    const { userId, clan } = await requireClanMember(ctx)
    const members = await membersOf(ctx, clan._id)
    const others = members.map((m) => m.userId).filter((id) => id !== userId)

    let targets: Id<'users'>[] | undefined
    if (args.targetUserIds !== undefined) {
      const picked = [...new Set(args.targetUserIds)]
      if (picked.length === 0) throw new ConvexError('Pick at least one clanmate')
      if (picked.some((id) => !others.includes(id))) {
        throw new ConvexError('You can only ping members of your clan')
      }
      targets = picked
    }
    if (others.length === 0) throw new ConvexError('Nobody else is in your clan yet')
    await rateLimiter.limit(ctx, 'clanPing', { key: userId, throws: true })

    const sentAt = Date.now()
    await ctx.db.insert('clanPings', {
      clanId: clan._id,
      fromUserId: userId,
      sentAt,
      ...(targets ? { targetUserIds: targets } : {}),
      goingUserIds: [],
    })
    await markReadAt(ctx, userId, clan._id, sentAt)

    const { displayName } = await publicIdentity(ctx, userId)
    for (const toUserId of targets ?? others) {
      await queuePush(ctx, {
        toUserId,
        fromUserId: userId,
        payload: {
          title: clan.name,
          body: `💪 ${displayName} is heading to the gym. Coming?`,
          url: '/clans/chat',
          tag: `clan-ping-${clan._id}`,
        },
      })
    }
  },
})

export const respondToPing = mutation({
  args: { pingId: v.id('clanPings') },
  handler: async (ctx, args) => {
    const { userId, clan } = await requireClanMember(ctx)
    const ping = await ctx.db.get(args.pingId)
    if (!ping || ping.clanId !== clan._id) throw new ConvexError('Ping not found')
    if (ping.fromUserId === userId) throw new ConvexError("That's your own ping")
    if (ping.targetUserIds && !ping.targetUserIds.includes(userId)) {
      throw new ConvexError("That ping wasn't for you")
    }
    if (Date.now() - ping.sentAt > PING_OPEN_MS) throw new ConvexError('That ping has closed')
    if (ping.goingUserIds.includes(userId)) return

    await ctx.db.patch(ping._id, { goingUserIds: [...ping.goingUserIds, userId] })
    const { displayName } = await publicIdentity(ctx, userId)
    await queuePush(ctx, {
      toUserId: ping.fromUserId,
      fromUserId: userId,
      payload: {
        title: clan.name,
        body: `🙋 ${displayName} is going too`,
        url: '/clans/chat',
        tag: `clan-ping-${clan._id}`,
      },
    })
  },
})

// ---------- thread ----------

export const getThread = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const mine = await myClanForRead(ctx)
    if (!mine) return null
    const { userId, clan } = mine
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit ?? THREAD_ENTRIES) || THREAD_ENTRIES),
      LIMITS.threadEntriesMax,
    )

    const [rawMessages, pings, mvps, blocked] = await Promise.all([
      ctx.db
        .query('clanMessages')
        .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clan._id))
        .order('desc')
        .take(limit),
      ctx.db
        .query('clanPings')
        .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clan._id))
        .order('desc')
        .take(limit),
      ctx.db
        .query('clanWeeklyMvps')
        .withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', clan._id))
        .order('desc')
        .take(MVPS_SHOWN),
      blockedByMe(ctx, userId),
    ])
    const who = identityCache(ctx)
    const now = Date.now()

    const messages = await Promise.all(
      rawMessages
        .filter((m) => !blocked.has(m.fromUserId))
        .map(async (m) => ({
          type: 'message' as const,
          key: m._id as string,
          ts: m.sentAt,
          isMine: m.fromUserId === userId,
          sender: await who(m.fromUserId),
          message: {
            _id: m._id,
            text: m.text,
            imageUrl: m.imageStorageId ? await ctx.storage.getUrl(m.imageStorageId) : null,
            imageWidth: m.imageWidth ?? null,
            imageHeight: m.imageHeight ?? null,
            reactions: (m.reactions ?? []).map((r) => ({ emoji: r.emoji, isMine: r.userId === userId })),
          },
        })),
    )

    const pingEntries = await Promise.all(
      pings
        .filter((p) => !blocked.has(p.fromUserId))
        .map(async (p) => {
          const isMine = p.fromUserId === userId
          const forMe = !p.targetUserIds || p.targetUserIds.includes(userId)
          const open = now - p.sentAt <= PING_OPEN_MS
          return {
            type: 'ping' as const,
            key: p._id as string,
            ts: p.sentAt,
            isMine,
            sender: await who(p.fromUserId),
            ping: {
              _id: p._id,
              // null = the whole clan.
              targets: p.targetUserIds
                ? await Promise.all(p.targetUserIds.map(async (id) => (await who(id)).displayName))
                : null,
              going: await Promise.all(p.goingUserIds.map(who)),
              iAmGoing: p.goingUserIds.includes(userId),
              canRespond: !isMine && forMe && open && !p.goingUserIds.includes(userId),
              open,
            },
          }
        }),
    )

    const mvpEntries = await Promise.all(
      mvps.map(async (m) => ({
        type: 'mvp' as const,
        key: m._id as string,
        ts: m._creationTime,
        isMine: false,
        winnerIsMe: m.userId === userId,
        winner: await who(m.userId),
        mvp: { weekStart: m.weekStart, points: m.points, daysTrained: m.daysTrained },
      })),
    )

    const entries = [...messages, ...pingEntries, ...mvpEntries]
    return {
      clanId: clan._id,
      name: clan.name,
      memberCount: clan.memberCount,
      isLeader: clan.leaderId === userId,
      entries: entries.sort((a, b) => a.ts - b.ts).slice(-limit),
    }
  },
})

/** Members to choose from when pinging, and for the chat's Members menu. */
export const members = query({
  args: {},
  handler: async (ctx) => {
    const mine = await myClanForRead(ctx)
    if (!mine) return []
    const rows = await membersOf(ctx, mine.clan._id)
    return await Promise.all(
      rows.map(async (m) => ({
        ...(await profileForWithAvatar(ctx, m.userId)),
        isMe: m.userId === mine.userId,
        isLeader: m.userId === mine.clan.leaderId,
      })),
    )
  },
})

// ---------- leaderboard (the weekly race) ----------

export const leaderboard = query({
  args: { period: v.union(v.literal('week'), v.literal('month')), periodStartMs: v.number() },
  handler: async (ctx, args) => {
    const mine = await myClanForRead(ctx)
    if (!mine) return []
    const start = canonicalPeriodStart(args.period, args.periodStartMs)
    const end = args.period === 'week' ? utcWeekEnd(start) : utcMonthEnd(start)

    const [rows, mvps] = await Promise.all([
      membersOf(ctx, mine.clan._id),
      ctx.db
        .query('clanWeeklyMvps')
        .withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', mine.clan._id))
        .take(520), // ten years of weeks
    ])
    const mvpCount = new Map<Id<'users'>, number>()
    for (const m of mvps) mvpCount.set(m.userId, (mvpCount.get(m.userId) ?? 0) + 1)

    const entries = await Promise.all(
      rows.map(async (m) => {
        const { points, daysTrained } = summarizePeriod(
          await finishedWorkoutsBetween(ctx, m.userId, start, end),
        )
        return {
          ...(await profileForWithAvatar(ctx, m.userId)),
          points,
          daysTrained,
          joinedAt: m.joinedAt,
          mvpCount: mvpCount.get(m.userId) ?? 0,
          isMe: m.userId === mine.userId,
          isLeader: m.userId === mine.clan.leaderId,
        }
      }),
    )
    return entries.sort(
      (a, b) => b.points - a.points || b.daysTrained - a.daysTrained || a.joinedAt - b.joinedAt,
    )
  },
})

// ---------- read state ----------

async function markReadAt(ctx: MutationCtx, userId: Id<'users'>, clanId: Id<'clans'>, ts: number) {
  const row = await ctx.db
    .query('clanReads')
    .withIndex('by_userId_and_clanId', (q) => q.eq('userId', userId).eq('clanId', clanId))
    .unique()
  if (!row) await ctx.db.insert('clanReads', { userId, clanId, lastReadAt: ts })
  else if (row.lastReadAt < ts) await ctx.db.patch(row._id, { lastReadAt: ts })
}

export const markRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, clan } = await requireClanMember(ctx)
    await markReadAt(ctx, userId, clan._id, Date.now())
  },
})

// Newest thing someone else posted, of each kind. A few rows each, not the thread.
async function latestFromOthers(ctx: QueryCtx, clanId: Id<'clans'>, userId: Id<'users'>) {
  const [messages, pings, mvp] = await Promise.all([
    ctx.db
      .query('clanMessages')
      .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clanId))
      .order('desc')
      .take(20),
    ctx.db
      .query('clanPings')
      .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clanId))
      .order('desc')
      .take(20),
    ctx.db
      .query('clanWeeklyMvps')
      .withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', clanId))
      .order('desc')
      .first(),
  ])
  return {
    latestMessage: messages[0] ?? null,
    latestPing: pings[0] ?? null,
    mvp,
    incomingAt: Math.max(
      messages.find((m) => m.fromUserId !== userId)?.sentAt ?? 0,
      pings.find((p) => p.fromUserId !== userId)?.sentAt ?? 0,
      mvp?._creationTime ?? 0,
    ),
  }
}

/** Your clan chat's row in the Chats tab: unread state and the last activity. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const mine = await myClanForRead(ctx)
    if (!mine) return null
    const { userId, clan } = mine
    const [read, latest] = await Promise.all([
      ctx.db
        .query('clanReads')
        .withIndex('by_userId_and_clanId', (q) => q.eq('userId', userId).eq('clanId', clan._id))
        .unique(),
      latestFromOthers(ctx, clan._id, userId),
    ])

    const candidates: { ts: number; text: string }[] = []
    const { latestMessage: m, latestPing: p, mvp } = latest
    if (m) {
      const name = m.fromUserId === userId ? 'You' : (await publicIdentity(ctx, m.fromUserId)).displayName
      candidates.push({ ts: m.sentAt, text: `${name}: ${m.text || '📷 Photo'}` })
    }
    if (p) {
      const name = p.fromUserId === userId ? 'You' : (await publicIdentity(ctx, p.fromUserId)).displayName
      candidates.push({ ts: p.sentAt, text: `💪 ${name} pinged ${p.targetUserIds ? 'some of the clan' : 'the clan'}` })
    }
    if (mvp) {
      const name = (await publicIdentity(ctx, mvp.userId)).displayName
      candidates.push({ ts: mvp._creationTime, text: `🏆 ${name} won the week` })
    }
    const last = candidates.sort((a, b) => b.ts - a.ts)[0] ?? null

    return {
      clanId: clan._id,
      name: clan.name,
      memberCount: clan.memberCount,
      unread: latest.incomingAt > (read?.lastReadAt ?? 0),
      last,
    }
  },
})

// ---------- the weekly race ----------

const MVP_PAGE = 25

/**
 * Crowns last week's MVP in every clan: whoever earned the most points that
 * week (then most days trained, then longest-standing member). A week where
 * nobody earned anything has no MVP. Cron-driven (convex/crons.ts) shortly
 * after Monday 00:00 UTC; pages through clans, rescheduling itself, and is
 * idempotent per (clan, week), so a retried or repeated run never crowns twice.
 */
export const awardWeeklyMvps = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), weekStart: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const weekStart = args.weekStart ?? utcWeekStart(Date.now()) - WEEK_MS
    if (weekStart !== utcWeekStart(weekStart)) throw new Error('Not a week start')
    const weekEnd = utcWeekEnd(weekStart)

    const page = await ctx.db
      .query('clans')
      .paginate({ numItems: MVP_PAGE, cursor: args.cursor ?? null })

    for (const clan of page.page) {
      const already = await ctx.db
        .query('clanWeeklyMvps')
        .withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', clan._id).eq('weekStart', weekStart))
        .first()
      if (already) continue

      const scored = await Promise.all(
        (await membersOf(ctx, clan._id)).map(async (m) => ({
          m,
          ...summarizePeriod(await finishedWorkoutsBetween(ctx, m.userId, weekStart, weekEnd)),
        })),
      )
      const best = scored
        .filter((s) => s.points > 0)
        .sort(
          (a, b) =>
            b.points - a.points || b.daysTrained - a.daysTrained || a.m.joinedAt - b.m.joinedAt,
        )[0]
      if (!best) continue
      await ctx.db.insert('clanWeeklyMvps', {
        clanId: clan._id,
        weekStart,
        userId: best.m.userId,
        points: best.points,
        daysTrained: best.daysTrained,
      })
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.clanChat.awardWeeklyMvps, {
        cursor: page.continueCursor,
        weekStart,
      })
    }
  },
})

// ---------- cleanup ----------

const PURGE_BATCH = 200

/** Everything a disbanded clan's chat left behind, in batches. */
export const purgeClanChat = internalMutation({
  args: { clanId: v.id('clans') },
  handler: async (ctx, { clanId }) => {
    let budget = PURGE_BATCH
    const messages = await ctx.db
      .query('clanMessages')
      .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clanId))
      .take(budget)
    for (const m of messages) {
      if (m.imageStorageId) await ctx.storage.delete(m.imageStorageId)
      await ctx.db.delete(m._id)
    }
    budget -= messages.length

    const drainTable = async (rows: { _id: Id<'clanPings'> | Id<'clanWeeklyMvps'> | Id<'clanReads'> }[]) => {
      for (const r of rows) await ctx.db.delete(r._id)
      budget -= rows.length
    }
    if (budget > 0) {
      await drainTable(
        await ctx.db
          .query('clanPings')
          .withIndex('by_clanId_and_sentAt', (q) => q.eq('clanId', clanId))
          .take(budget),
      )
    }
    if (budget > 0) {
      await drainTable(
        await ctx.db
          .query('clanWeeklyMvps')
          .withIndex('by_clanId_and_weekStart', (q) => q.eq('clanId', clanId))
          .take(budget),
      )
    }
    if (budget > 0) {
      await drainTable(
        await ctx.db.query('clanReads').withIndex('by_clanId', (q) => q.eq('clanId', clanId)).take(budget),
      )
    }
    for (const { userId } of await presenceComponent.listRoom(ctx, clanRoomId(clanId), false)) {
      await presenceComponent.removeRoomUser(ctx, clanRoomId(clanId), userId)
    }
    // Anything left means the budget ran out; continue in a fresh transaction.
    if (budget <= 0) await ctx.scheduler.runAfter(0, internal.clanChat.purgeClanChat, { clanId })
  },
})

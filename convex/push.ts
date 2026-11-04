import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { chatRoomId } from './chatRoom'
import { envVar } from './env'
import { isBlockedEitherWay } from './friendships'
import { publicIdentity } from './identity'
import { presenceComponent } from './presence'
import { requireWriter } from './rateLimiter'

/**
 * Web Push: telling someone's device about something while the app is closed.
 *
 * Layered on top of what already happens rather than replacing it. Mutations
 * call queuePush alongside their normal writes, and the actual network call
 * happens in pushSender.ts, because only an action may do that.
 */

export type PushPayload = {
  title: string
  body?: string
  url: string
  // One notification per tag, so a burst updates in place instead of stacking.
  tag?: string
}

// A person realistically has a phone, a laptop and an old device or two.
const MAX_SUBSCRIPTIONS_PER_USER = 10
const MAX_BODY_LENGTH = 140

// The sender makes a server-side request to whatever endpoint is stored, so an
// unchecked one would let any signed-in user aim our backend at any URL. Browsers
// only ever hand out endpoints on these push services.
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^web\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
]

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  // A custom port or embedded credentials are never part of a real endpoint.
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  return PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
}

// 404 and 410 are how a push service says this subscription is gone for good.
export function isExpiredPushStatus(status: number | undefined): boolean {
  return status === 404 || status === 410
}

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    const profile =
      userId === null
        ? null
        : await ctx.db
            .query('profiles')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .unique()
    return {
      // Null on a deployment with no keys set, which hides every push control.
      publicKey: envVar('VAPID_PUBLIC_KEY') ?? null,
      hideMessageText: profile?.pushHideMessageText ?? false,
    }
  },
})

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)
    if (!isAllowedPushEndpoint(args.endpoint)) throw new ConvexError('Unsupported push service')
    if (args.p256dh.length > 256 || args.auth.length > 256) {
      throw new ConvexError('Invalid subscription')
    }

    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .unique()
    if (existing?.userId === userId) return

    // An endpoint identifies a device, so whoever subscribes it now owns it.
    // Otherwise a shared phone would keep getting the last person's messages.
    if (existing) await ctx.db.delete(existing._id)

    const mine = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAX_SUBSCRIPTIONS_PER_USER + 1)
    if (mine.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      // Oldest first: the most likely to be a device no longer in use.
      await ctx.db.delete(mine[0]!._id)
    }

    await ctx.db.insert('pushSubscriptions', {
      userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: Date.now(),
    })
  },
})

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return
    const existing = await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
      .unique()
    if (existing?.userId === userId) await ctx.db.delete(existing._id)
  },
})

export const setHideMessageText = mutation({
  args: { hide: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    if (profile) await ctx.db.patch(profile._id, { pushHideMessageText: args.hide })
  },
})

/**
 * Schedules a push, if there's anyone to send it to. Runs inside the caller's
 * mutation, so it rolls back with it.
 *
 * Checks for subscriptions first because almost every call has none, and nothing
 * should be scheduled for those, or looked up for that matter.
 */
export async function queuePush(
  ctx: MutationCtx,
  args: { toUserId: Id<'users'>; fromUserId: Id<'users'>; payload: PushPayload },
) {
  const first = await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_user', (q) => q.eq('userId', args.toUserId))
    .first()
  if (!first) return
  if (await isBlockedEitherWay(ctx, args.toUserId, args.fromUserId)) return

  await ctx.scheduler.runAfter(0, internal.pushSender.send, {
    userId: args.toUserId,
    payload: args.payload,
  })
}

function truncated(text: string): string {
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH - 1)}…` : text
}

export async function queueMessagePush(
  ctx: MutationCtx,
  args: {
    toUserId: Id<'users'>
    fromUserId: Id<'users'>
    text: string
    hasImage: boolean
  },
) {
  const first = await ctx.db
    .query('pushSubscriptions')
    .withIndex('by_user', (q) => q.eq('userId', args.toUserId))
    .first()
  if (!first) return

  // Online in the room means this chat is on their screen right now: the presence
  // hook disconnects when the tab is hidden. They've already seen it.
  const inRoom = await presenceComponent.listRoom(
    ctx,
    chatRoomId(args.toUserId, args.fromUserId),
    true,
  )
  if (inRoom.some((member) => member.userId === args.toUserId)) return

  const [sender, recipient] = await Promise.all([
    publicIdentity(ctx, args.fromUserId),
    ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', args.toUserId))
      .unique(),
  ])
  const preview = args.text ? truncated(args.text) : args.hasImage ? '📷 Photo' : ''

  await queuePush(ctx, {
    toUserId: args.toUserId,
    fromUserId: args.fromUserId,
    payload: {
      title: recipient?.pushHideMessageText
        ? `New message from ${sender.displayName}`
        : sender.displayName,
      ...(!recipient?.pushHideMessageText && preview ? { body: preview } : {}),
      url: `/friends/${args.fromUserId}/chat`,
      tag: `chat-${args.fromUserId}`,
    },
  })
}

// ---------- for pushSender.ts, which as an action has no ctx.db ----------

export const subscriptionsFor = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) =>
    await ctx.db
      .query('pushSubscriptions')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(MAX_SUBSCRIPTIONS_PER_USER),
})

export const removeExpired = internalMutation({
  args: { ids: v.array(v.id('pushSubscriptions')) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      if (await ctx.db.get(id)) await ctx.db.delete(id)
    }
  },
})

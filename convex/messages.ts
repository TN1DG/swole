import { v, ConvexError } from 'convex/values'
import { mutation, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { assertRange, cleanText, LIMITS } from './validation'
import { rateLimiter, requireWriter } from './rateLimiter'
import { areFriends, isBlockedEitherWay } from './friendships'
import { REACTION_EMOJIS } from './constants'
import { queueMessagePush } from './push'

// The client optimizes to ~300KB at up to 1280px (src/lib/optimizeImage.ts), so
// anything near this ceiling didn't come through our own UI.
const MAX_MESSAGE_PHOTO_BYTES = 1024 * 1024


// Both directions of a conversation, oldest first. A plain exported helper
// rather than a query so friendThread.ts can fold it into the unified thread
// without a nested ctx.runQuery — everything is already inside one
// transaction, so a direct call is both cheaper and simpler.
export async function messagesBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
  limit: number,
) {
  const [sent, received] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', friendId))
      .order('desc')
      .take(limit),
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
      .order('desc')
      .take(limit),
  ])
  return [...sent, ...received].sort((a, b) => a.sentAt - b.sentAt)
}

// The most recent thing this friend sent me, for the unread check. Cheaper
// than loading the whole thread just to look at its last entry.
export async function latestIncomingMessageAt(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
): Promise<number> {
  const latest = await ctx.db
    .query('messages')
    .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
    .order('desc')
    .first()
  return latest?.sentAt ?? 0
}

// Whichever of us sent the most recent message, in either direction — for
// the Friends-list activity preview. Two indexed point lookups (cheap, same
// shape as latestIncomingMessageAt) rather than loading the whole thread.
export async function latestMessageBetween(
  ctx: QueryCtx,
  userId: Id<'users'>,
  friendId: Id<'users'>,
): Promise<{ ts: number; isMine: boolean; text: string; hasImage: boolean } | null> {
  const [mine, theirs] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', userId).eq('toUserId', friendId))
      .order('desc')
      .first(),
    ctx.db
      .query('messages')
      .withIndex('by_from_to', (q) => q.eq('fromUserId', friendId).eq('toUserId', userId))
      .order('desc')
      .first(),
  ])
  const latest = [mine, theirs]
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.sentAt - a.sentAt)[0]
  if (!latest) return null
  return {
    ts: latest.sentAt,
    isMine: latest.fromUserId === userId,
    text: latest.text,
    hasImage: latest.imageStorageId !== undefined,
  }
}

export type MessagePhotoFields = {
  imageStorageId: Id<'_storage'>
  imageWidth: number
  imageHeight: number
}

/**
 * The checks an attached chat photo must pass, shared by 1:1 messages and clan
 * chat (clanChat.ts) so the two can't drift apart.
 *
 * `missing` means the upload isn't there (nothing to clean up); `refused` means
 * it is but isn't acceptable, so the caller must delete the blob before
 * returning — without throwing, or the delete would roll back with it.
 */
export async function checkMessagePhoto(
  ctx: QueryCtx,
  image: { storageId: Id<'_storage'>; width: number; height: number },
): Promise<{ fields: MessagePhotoFields } | { missing: string } | { refused: string }> {
  const width = assertRange(image.width, 1, LIMITS.imageMaxEdge, 'Photo width')
  const height = assertRange(image.height, 1, LIMITS.imageMaxEdge, 'Photo height')
  const metadata = await ctx.db.system.get('_storage', image.storageId)
  if (!metadata) return { missing: 'Upload not found — try again' }
  const wrongType = metadata.contentType !== undefined && !metadata.contentType.startsWith('image/')
  if (wrongType || metadata.size > MAX_MESSAGE_PHOTO_BYTES) {
    return { refused: 'That file needs to be an image under 1MB' }
  }
  return { fields: { imageStorageId: image.storageId, imageWidth: width, imageHeight: height } }
}

// Step 1 of a photo message, mirroring profiles.generateAvatarUploadUrl.
export const generateMessagePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'messagePhotoUploadUrl', { key: userId, throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Sends a chat message, with an optional photo.
 *
 * A rejection with a photo attached returns `{ ok: false }` instead of throwing,
 * so the delete of the already-uploaded blob commits. Throwing would roll it back
 * and orphan the blob, the same trap documented on profiles.ts:setAvatar.
 */
export const send = mutation({
  args: {
    toUserId: v.id('users'),
    text: v.string(),
    image: v.optional(
      v.object({ storageId: v.id('_storage'), width: v.number(), height: v.number() }),
    ),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; error: string }> => {
    const fromUserId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'messageSend', { key: fromUserId, throws: true })

    const refuse = async (error: string) => {
      if (!args.image) throw new ConvexError(error)
      await ctx.storage.delete(args.image.storageId)
      return { ok: false as const, error }
    }

    if (fromUserId === args.toUserId) return await refuse("You can't message yourself")
    if (!(await areFriends(ctx, fromUserId, args.toUserId))) {
      return await refuse('You can only message friends')
    }
    // Worded so it doesn't reveal a block: blocks are silent by design.
    if (await isBlockedEitherWay(ctx, fromUserId, args.toUserId)) {
      return await refuse("This message couldn't be delivered")
    }

    // A caption is optional on a photo; text is required otherwise.
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

    // No in-app notice is raised for chat — the per-thread unread badge on the
    // Friends list covers this, and one banner per incoming message would
    // bury everything else. A device notification is different: it collapses per
    // conversation, and it's how you find out while the app is closed.
    await ctx.db.insert('messages', {
      fromUserId,
      toUserId: args.toUserId,
      text,
      sentAt: Date.now(),
      ...image,
    })
    await queueMessagePush(ctx, {
      toUserId: args.toUserId,
      fromUserId,
      text,
      hasImage: image !== null,
    })
    return { ok: true }
  },
})

// One reaction per person per message: the same emoji again removes it, a
// different one replaces it.
export const toggleReaction = mutation({
  args: { messageId: v.id('messages'), emoji: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'messageReact', { key: userId, throws: true })

    if (!(REACTION_EMOJIS as readonly string[]).includes(args.emoji)) {
      throw new ConvexError('Unknown reaction')
    }

    const message = await ctx.db.get(args.messageId)
    if (!message || (message.fromUserId !== userId && message.toUserId !== userId)) {
      throw new ConvexError('Message not found')
    }
    const otherId = message.fromUserId === userId ? message.toUserId : message.fromUserId
    if (await isBlockedEitherWay(ctx, userId, otherId)) {
      throw new ConvexError('Not available')
    }

    const existing = message.reactions ?? []
    const mine = existing.find((r) => r.userId === userId)
    const others = existing.filter((r) => r.userId !== userId)
    await ctx.db.patch(args.messageId, {
      reactions: mine?.emoji === args.emoji ? others : [...others, { userId, emoji: args.emoji }],
    })
  },
})

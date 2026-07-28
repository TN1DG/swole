import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

// How many unread notices the banner stack will ever need at once. Also the
// ceiling on the "mark superseded ones read" sweep below.
const MAX_UNREAD = 20

export type NotificationKind =
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'ping_received'
  | 'workout_finished_after_ping'

// Who a notification is about. Kept local rather than importing friends.ts's
// `profileFor`: that one is private to its own file by the repo's
// domain-file convention, and this needs to resolve a *non-friend* (the
// sender of a friend request you haven't accepted yet).
//
// Deliberately falls back to the username, NOT the email the way
// friends.ts's profileFor does. A friend-request notice names someone you
// haven't accepted yet, so surfacing their email address here would leak it
// to a stranger; the username is already public (it's how people find each
// other). In practice onboarding requires both a username and a display
// name, so the final fallback is close to unreachable.
async function senderName(ctx: QueryCtx, userId: Id<'users'>): Promise<string> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  return profile?.displayName ?? profile?.username ?? 'Someone'
}

/**
 * Records a notification. A plain helper, not a Convex function: every caller
 * is already inside a mutation, so this runs in that same transaction — if
 * the surrounding action rolls back, so does its notification.
 *
 * Callers should treat this as best-effort and not let it block the real
 * work (see workouts.ts's finish, which already wraps its ping-linking in a
 * try/catch for exactly that reason).
 */
export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'>
    kind: NotificationKind
    fromUserId: Id<'users'>
    pingId?: Id<'gymPings'>
    workoutId?: Id<'workouts'>
  },
) {
  // Built field by field rather than spreading `args`: `undefined` is not a
  // valid Convex value, so an absent optional has to be genuinely absent.
  await ctx.db.insert('notifications', {
    userId: args.userId,
    kind: args.kind,
    fromUserId: args.fromUserId,
    createdAt: Date.now(),
    ...(args.pingId !== undefined && { pingId: args.pingId }),
    ...(args.workoutId !== undefined && { workoutId: args.workoutId }),
  })
}

/**
 * Marks unread notifications of one kind from one person as read, for when
 * the user handles the underlying thing somewhere other than the banner —
 * e.g. accepting a friend request from the Friends page. Without this the
 * banner would keep saying "X sent you a friend request" after you'd already
 * accepted it.
 */
export async function markHandled(
  ctx: MutationCtx,
  userId: Id<'users'>,
  kind: NotificationKind,
  fromUserId: Id<'users'>,
) {
  const unread = await ctx.db
    .query('notifications')
    .withIndex('by_user_readAt', (q) => q.eq('userId', userId).eq('readAt', undefined))
    .take(MAX_UNREAD)

  const now = Date.now()
  for (const notification of unread) {
    if (notification.kind === kind && notification.fromUserId === fromUserId) {
      await ctx.db.patch(notification._id, { readAt: now })
    }
  }
}

// Every unread notification for the caller, newest first, with the sender's
// display name resolved for the banner copy.
export const listUnread = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []

    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_readAt', (q) => q.eq('userId', userId).eq('readAt', undefined))
      .order('desc')
      .take(MAX_UNREAD)

    return Promise.all(
      unread.map(async (notification) => ({
        _id: notification._id,
        kind: notification.kind,
        fromUserId: notification.fromUserId,
        fromName: await senderName(ctx, notification.fromUserId),
        createdAt: notification.createdAt,
        pingId: notification.pingId ?? null,
        workoutId: notification.workoutId ?? null,
      })),
    )
  },
})

export const markRead = mutation({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found')
    }
    if (notification.readAt !== undefined) return
    await ctx.db.patch(args.notificationId, { readAt: Date.now() })
  },
})

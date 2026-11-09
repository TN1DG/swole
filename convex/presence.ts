import { Presence } from '@convex-dev/presence'
import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { components } from './_generated/api'
import { mutation, query } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { chatRoomId, clanIdOfRoom, clanRoomId, otherRoomMember } from './chatRoom'
import { areFriends, isBlockedEitherWay } from './friendships'
import { assertRange } from './validation'
import { rateLimiter } from './rateLimiter'

// "Active now" and "typing…" in a friend chat. These wrap the component's public
// functions, which trust whatever they're given, with the checks it can't do.
export const presenceComponent = new Presence(components.presence)

// Deliberately NOT requireWriter: these fire on a timer while a chat is open, and
// sitting in a conversation shouldn't eat the budget that protects real writes.

// What a refused heartbeat gets. The usePresence hook treats empty tokens as "no
// room", so it quietly shows nobody. Throwing instead would put an error in the
// console every 10 seconds, which is both noise and a way for someone to discover
// they've been blocked, when blocks are meant to be silent.
const NO_ROOM = { roomToken: '', sessionToken: '' }

// `userId` is part of the signature the usePresence hook calls with, and is
// ignored: identity comes only from auth, so nobody can appear online as someone
// else, and only a member of a friendship can obtain that room's token.
export const heartbeat = mutation({
  args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
  handler: async (ctx, args) => {
    const me = await getAuthUserId(ctx)
    if (me === null) return NO_ROOM

    // A clan's group chat: only a current member gets the room's token.
    const clanId = clanIdOfRoom(args.roomId)
    if (clanId !== null) {
      const membership = await ctx.db
        .query('clanMembers')
        .withIndex('by_user', (q) => q.eq('userId', me))
        .unique()
      if (!membership || membership.clanId !== clanId) return NO_ROOM
      const interval = assertRange(args.interval, 1000, 60000, 'Interval')
      return await presenceComponent.heartbeat(ctx, args.roomId, me, args.sessionId, interval)
    }

    const friendId = otherRoomMember(args.roomId, me)
    if (
      friendId === null ||
      !(await areFriends(ctx, me, friendId as Id<'users'>)) ||
      (await isBlockedEitherWay(ctx, me, friendId as Id<'users'>))
    ) {
      return NO_ROOM
    }

    const interval = assertRange(args.interval, 1000, 60000, 'Interval')
    return await presenceComponent.heartbeat(ctx, args.roomId, me, args.sessionId, interval)
  },
})

// Gated by the room token, which only heartbeat hands out. No per-user reads, as
// the component advises, so both people's subscriptions share one cached result.
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, args) => await presenceComponent.list(ctx, args.roomToken),
})

// No auth check possible: the hook calls this over sendBeacon as the page closes,
// with no credentials. Harmless, since it needs the unguessable session token.
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => await presenceComponent.disconnect(ctx, args.sessionToken),
})

export const setTyping = mutation({
  args: { friendUserId: v.id('users'), typing: v.boolean() },
  handler: async (ctx, args) => {
    const me = await getAuthUserId(ctx)
    if (me === null) throw new ConvexError('Not signed in')
    if (
      !(await areFriends(ctx, me, args.friendUserId)) ||
      (await isBlockedEitherWay(ctx, me, args.friendUserId))
    ) {
      return
    }

    // Over the limit just means a typing dot doesn't update, which isn't worth
    // showing anyone an error for.
    const { ok } = await rateLimiter.limit(ctx, 'typingUpdate', { key: me })
    if (!ok) return

    await presenceComponent.updateRoomUser(ctx, chatRoomId(me, args.friendUserId), me, {
      typing: args.typing,
    })
  },
})

// "X is typing…" in your clan's group chat.
export const setClanTyping = mutation({
  args: { typing: v.boolean() },
  handler: async (ctx, args) => {
    const me = await getAuthUserId(ctx)
    if (me === null) throw new ConvexError('Not signed in')
    const membership = await ctx.db
      .query('clanMembers')
      .withIndex('by_user', (q) => q.eq('userId', me))
      .unique()
    if (!membership) return

    const { ok } = await rateLimiter.limit(ctx, 'typingUpdate', { key: me })
    if (!ok) return

    await presenceComponent.updateRoomUser(ctx, clanRoomId(membership.clanId), me, {
      typing: args.typing,
    })
  },
})

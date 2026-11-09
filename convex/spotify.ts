import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { envVar } from './env'
import { requireWriter } from './rateLimiter'
import { areFriends, isBlockedEitherWay } from './friendships'

// Spotify "now playing" during a workout.
//
// Spotify keeps apps in Development Mode to 5 allowlisted users, and extended
// quota isn't available to an app Swole's size. So connecting is invite-only:
// SPOTIFY_ALLOWED_USERS lists the Swole usernames that may connect, and they
// must also be added under User Management in the Spotify dashboard. Seeing a
// friend's track needs no Spotify account at all.
//
// The HTTP callback and the poll loop live in spotifyApi.ts; this file holds
// the database side.

export const SPOTIFY_SCOPE = 'user-read-currently-playing'
const STATE_TTL_MS = 10 * 60 * 1000

export function spotifyConfig() {
  const clientId = envVar('SPOTIFY_CLIENT_ID')
  const clientSecret = envVar('SPOTIFY_CLIENT_SECRET')
  const siteUrl = envVar('CONVEX_SITE_URL')
  if (!clientId || !clientSecret || !siteUrl) return null
  const allowed = new Set(
    (envVar('SPOTIFY_ALLOWED_USERS') ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
  return { clientId, clientSecret, redirectUri: `${siteUrl}/spotify/callback`, allowed }
}

async function connectionOf(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('spotifyConnections')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
}

async function nowPlayingRowOf(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('spotifyNowPlaying')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
}

// The newest workout is the active one if it hasn't ended.
async function activeWorkoutOf(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const latest = await ctx.db
    .query('workouts')
    .withIndex('by_owner', (q) => q.eq('ownerId', userId))
    .order('desc')
    .first()
  return latest && latest.endedAt === undefined ? latest : null
}

async function canConnect(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const config = spotifyConfig()
  if (!config) return false
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  return !!profile?.username && config.allowed.has(profile.username.toLowerCase())
}

// ---------- helpers for other modules ----------

// Start (or restart) the poll loop for a user who has Spotify connected. A new
// pollToken retires any loop already running, so calling this twice is safe.
export async function kickSpotifyPoller(ctx: MutationCtx, userId: Id<'users'>) {
  const connection = await connectionOf(ctx, userId)
  if (!connection || !spotifyConfig()) return
  const pollToken = crypto.randomUUID()
  await ctx.db.patch(connection._id, { pollToken })
  await ctx.scheduler.runAfter(0, internal.spotifyApi.poll, { userId, pollToken })
}

// The workout is over: stop showing the track. The poll loop sees no active
// workout on its next run and stops by itself.
export async function clearNowPlaying(ctx: MutationCtx, userId: Id<'users'>) {
  const row = await nowPlayingRowOf(ctx, userId)
  if (row) await ctx.db.delete(row._id)
}

// ---------- public ----------

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const connection = await connectionOf(ctx, userId)
    return {
      canConnect: await canConnect(ctx, userId),
      connected: connection !== null,
      displayName: connection?.displayName ?? null,
    }
  },
})

// Returns the Spotify consent URL to send the browser to.
export const startConnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)
    const config = spotifyConfig()
    if (!config || !(await canConnect(ctx, userId))) {
      throw new Error('Spotify isn’t available for this account')
    }

    // One pending attempt per user; an abandoned one is simply replaced.
    for (const old of await ctx.db
      .query('spotifyOAuthStates')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(10)) {
      await ctx.db.delete(old._id)
    }
    const state = crypto.randomUUID()
    await ctx.db.insert('spotifyOAuthStates', { userId, state, createdAt: Date.now() })

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: SPOTIFY_SCOPE,
      state,
    })
    return `https://accounts.spotify.com/authorize?${params}`
  },
})

export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)
    const connection = await connectionOf(ctx, userId)
    if (connection) await ctx.db.delete(connection._id)
    await clearNowPlaying(ctx, userId)
  },
})

// What this user is playing in their current workout, for themselves and
// their friends. Null for anyone else, when blocked either way, or when
// they aren't working out with Spotify on. The client hides a row whose
// `updatedAt` has gone stale, since a query can't read the clock.
export const nowPlayingFor = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx)
    if (viewerId === null) return null
    if (viewerId !== args.userId) {
      if (!(await areFriends(ctx, viewerId, args.userId))) return null
      if (await isBlockedEitherWay(ctx, viewerId, args.userId)) return null
    }
    return await visibleNowPlaying(ctx, args.userId)
  },
})

// The public shape of a now-playing row, or null when there's no workout.
export async function visibleNowPlaying(ctx: QueryCtx, userId: Id<'users'>) {
  const row = await nowPlayingRowOf(ctx, userId)
  if (!row || !(await activeWorkoutOf(ctx, userId))) return null
  return {
    trackName: row.trackName,
    artists: row.artists,
    albumArtUrl: row.albumArtUrl ?? null,
    trackUrl: row.trackUrl,
    contextUrl: row.contextUrl ?? null,
    contextType: row.contextType ?? null,
    isPlaying: row.isPlaying,
    updatedAt: row.updatedAt,
  }
}

// ---------- internal (spotifyApi.ts) ----------

// Single use: the row is deleted whether or not it's still valid.
export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('spotifyOAuthStates')
      .withIndex('by_state', (q) => q.eq('state', args.state))
      .unique()
    if (!row) return null
    await ctx.db.delete(row._id)
    if (Date.now() - row.createdAt > STATE_TTL_MS) return null
    return row.userId
  },
})

export const saveConnection = internalMutation({
  args: {
    userId: v.id('users'),
    spotifyUserId: v.string(),
    displayName: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // The account may have been deleted while the user was on Spotify's page.
    if (!(await ctx.db.get(args.userId))) return
    const { userId, ...fields } = args
    const existing = await connectionOf(ctx, userId)
    if (existing) await ctx.db.patch(existing._id, fields)
    else await ctx.db.insert('spotifyConnections', { userId, ...fields })

    // Connected mid-workout: start showing the track right away.
    if (await activeWorkoutOf(ctx, userId)) await kickSpotifyPoller(ctx, userId)
  },
})

export const pollContext = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, args.userId)
    const workout = await activeWorkoutOf(ctx, args.userId)
    return {
      connection: connection && {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        expiresAt: connection.expiresAt,
        pollToken: connection.pollToken ?? null,
      },
      workoutStartedAt: workout?.startedAt ?? null,
    }
  },
})

export const saveTokens = internalMutation({
  args: {
    userId: v.id('users'),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, args.userId)
    if (!connection) return
    await ctx.db.patch(connection._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      // Spotify sometimes rotates the refresh token; keep the newest.
      ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
    })
  },
})

const trackValidator = v.object({
  trackId: v.string(),
  trackName: v.string(),
  artists: v.string(),
  albumArtUrl: v.optional(v.string()),
  trackUrl: v.string(),
  contextUrl: v.optional(v.string()),
  contextType: v.optional(v.string()),
  isPlaying: v.boolean(),
})

// Returns false when this loop has been retired (a newer pollToken, a
// disconnect, or the workout ended), telling it to stop.
export const writeNowPlaying = internalMutation({
  args: { userId: v.id('users'), pollToken: v.string(), track: v.union(trackValidator, v.null()) },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, args.userId)
    if (!connection || connection.pollToken !== args.pollToken) return false
    if (!(await activeWorkoutOf(ctx, args.userId))) {
      await clearNowPlaying(ctx, args.userId)
      return false
    }

    const row = await nowPlayingRowOf(ctx, args.userId)
    if (args.track === null) {
      if (row) await ctx.db.delete(row._id)
      return true
    }
    const fields = { ...args.track, updatedAt: Date.now() }
    if (row) await ctx.db.replace(row._id, { userId: args.userId, ...fields })
    else await ctx.db.insert('spotifyNowPlaying', { userId: args.userId, ...fields })
    return true
  },
})

// End this loop. `revoked` also removes the connection, for when Spotify no
// longer accepts the grant (the user removed Swole from their account).
export const stopPolling = internalMutation({
  args: { userId: v.id('users'), pollToken: v.string(), revoked: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, args.userId)
    if (!connection || connection.pollToken !== args.pollToken) return
    await clearNowPlaying(ctx, args.userId)
    if (args.revoked) await ctx.db.delete(connection._id)
    else await ctx.db.patch(connection._id, { pollToken: undefined })
  },
})

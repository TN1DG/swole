import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  createBackend,
  createBuiltInExercise,
  makeFriends,
  userWithUsername,
  type T,
} from './test.helpers'

const ENV = {
  SPOTIFY_CLIENT_ID: 'client-id',
  SPOTIFY_CLIENT_SECRET: 'client-secret',
  SPOTIFY_ALLOWED_USERS: 'alice, Carol',
  CONVEX_SITE_URL: 'https://example.convex.site',
  SITE_URL: 'https://swole.test',
}

type Route = (url: string, init?: RequestInit) => Response | undefined
let routes: Route[] = []
const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  for (const route of routes) {
    const res = route(url, init)
    if (res) return res
  }
  throw new Error(`Unexpected fetch ${url}`)
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const tokenRoute = (body: object, status = 200): Route => (url) =>
  url === 'https://accounts.spotify.com/api/token' ? json(body, status) : undefined
const meRoute = (status = 200): Route => (url) =>
  url === 'https://api.spotify.com/v1/me'
    ? json({ id: 'spotify-alice', display_name: 'Alice S' }, status)
    : undefined

const TRACK = {
  is_playing: true,
  context: { type: 'playlist', external_urls: { spotify: 'https://open.spotify.com/playlist/p1' } },
  item: {
    type: 'track',
    id: 't1',
    name: 'Lift Song',
    artists: [{ name: 'Band A' }, { name: 'Band B' }],
    album: { images: [{ url: 'https://i.scdn.co/big', width: 640 }, { url: 'https://i.scdn.co/mid', width: 300 }] },
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  },
}
const playingRoute = (body: unknown = TRACK, status = 200): Route => (url) =>
  url === 'https://api.spotify.com/v1/me/player/currently-playing'
    ? status === 204
      ? new Response(null, { status: 204 })
      : json(body, status)
    : undefined

beforeEach(() => {
  // Scheduled polls only run when a test says so.
  vi.useFakeTimers()
  Object.assign(process.env, ENV)
  routes = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const key of Object.keys(ENV)) delete process.env[key]
})

// A connected user, written directly rather than through the OAuth dance.
async function connect(t: T, userId: Id<'users'>, fields: { expiresAt?: number } = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert('spotifyConnections', {
      userId,
      spotifyUserId: 'spotify-user',
      displayName: 'Spotify User',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: fields.expiresAt ?? Date.now() + 3600_000,
    })
  })
}

async function connectionOf(t: T, userId: Id<'users'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('spotifyConnections')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique(),
  )
}

async function nowPlayingRow(t: T, userId: Id<'users'>) {
  return await t.run(async (ctx) =>
    ctx.db
      .query('spotifyNowPlaying')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique(),
  )
}

// Alice connected and mid-workout, with the track already polled once.
async function aliceWorkingOutToMusic(t: T) {
  const alice = await userWithUsername(t, 'alice')
  await connect(t, alice.userId)
  const workoutId = await alice.user.mutation(api.workouts.start, {})
  const { pollToken } = (await connectionOf(t, alice.userId))!
  routes.push(playingRoute())
  await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken: pollToken! })
  return { alice, workoutId, pollToken: pollToken! }
}

describe('connecting', () => {
  it('is unavailable without the Spotify env vars', async () => {
    delete process.env.SPOTIFY_CLIENT_SECRET
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    expect(await alice.user.query(api.spotify.status, {})).toMatchObject({ canConnect: false })
    await expect(alice.user.mutation(api.spotify.startConnect, {})).rejects.toThrow(/isn’t available/)
  })

  it('is invite-only', async () => {
    const t = createBackend()
    const bob = await userWithUsername(t, 'bob')
    const carol = await userWithUsername(t, 'carol')
    expect(await bob.user.query(api.spotify.status, {})).toMatchObject({ canConnect: false })
    await expect(bob.user.mutation(api.spotify.startConnect, {})).rejects.toThrow(/isn’t available/)
    // Allowlist matching ignores case and spacing.
    expect(await carol.user.query(api.spotify.status, {})).toMatchObject({ canConnect: true })
  })

  it('connects through the callback, and never exposes the tokens', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const authorizeUrl = new URL(await alice.user.mutation(api.spotify.startConnect, {}))
    expect(authorizeUrl.origin).toBe('https://accounts.spotify.com')
    expect(authorizeUrl.searchParams.get('client_id')).toBe('client-id')
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'https://example.convex.site/spotify/callback',
    )
    const state = authorizeUrl.searchParams.get('state')!

    routes.push(tokenRoute({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }), meRoute())
    const res = await t.fetch(`/spotify/callback?code=abc&state=${state}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://swole.test/profile?spotify=connected')

    const status = await alice.user.query(api.spotify.status, {})
    expect(status).toEqual({ canConnect: true, connected: true, displayName: 'Alice S' })
    expect((await connectionOf(t, alice.userId))!.refreshToken).toBe('r1')

    // The state was single-use.
    const replay = await t.fetch(`/spotify/callback?code=abc&state=${state}`)
    expect(replay.headers.get('Location')).toBe('https://swole.test/profile?spotify=error')
  })

  it('rejects unknown and expired states', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const unknown = await t.fetch('/spotify/callback?code=abc&state=nope')
    expect(unknown.headers.get('Location')).toBe('https://swole.test/profile?spotify=error')

    const state = new URL(await alice.user.mutation(api.spotify.startConnect, {})).searchParams.get('state')!
    vi.advanceTimersByTime(11 * 60 * 1000)
    const expired = await t.fetch(`/spotify/callback?code=abc&state=${state}`)
    expect(expired.headers.get('Location')).toBe('https://swole.test/profile?spotify=error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains when the Spotify account is not on the app’s user list', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const state = new URL(await alice.user.mutation(api.spotify.startConnect, {})).searchParams.get('state')!
    routes.push(tokenRoute({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }), meRoute(403))
    const res = await t.fetch(`/spotify/callback?code=abc&state=${state}`)
    expect(res.headers.get('Location')).toBe('https://swole.test/profile?spotify=not_allowed')
    expect(await connectionOf(t, alice.userId)).toBeNull()
  })

  it('disconnects', async () => {
    const t = createBackend()
    const { alice } = await aliceWorkingOutToMusic(t)
    await alice.user.mutation(api.spotify.disconnect, {})
    expect(await connectionOf(t, alice.userId)).toBeNull()
    expect(await nowPlayingRow(t, alice.userId)).toBeNull()
  })
})

describe('who sees the track', () => {
  it('the user and their friends, while the workout lasts', async () => {
    const t = createBackend()
    const { alice, workoutId } = await aliceWorkingOutToMusic(t)
    const bob = await userWithUsername(t, 'bob')
    await makeFriends(t, alice.userId, bob.userId)

    const seen = await bob.user.query(api.spotify.nowPlayingFor, { userId: alice.userId })
    expect(seen).toMatchObject({
      trackName: 'Lift Song',
      artists: 'Band A, Band B',
      albumArtUrl: 'https://i.scdn.co/mid',
      trackUrl: 'https://open.spotify.com/track/t1',
      contextUrl: 'https://open.spotify.com/playlist/p1',
      contextType: 'playlist',
      isPlaying: true,
    })
    expect(seen).not.toHaveProperty('accessToken')
    expect(await alice.user.query(api.spotify.nowPlayingFor, { userId: alice.userId })).not.toBeNull()

    const [friend] = await bob.user.query(api.friends.myFriends, {})
    expect(friend.nowPlaying).toMatchObject({ trackName: 'Lift Song', artists: 'Band A, Band B' })

    // Finishing clears it.
    const exerciseId = await createBuiltInExercise(t)
    await alice.user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    const active = await alice.user.query(api.workouts.getActive, {})
    await alice.user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id, weightKg: 100, reps: 5, completed: true,
    })
    await alice.user.mutation(api.workouts.finish, { workoutId })
    expect(await bob.user.query(api.spotify.nowPlayingFor, { userId: alice.userId })).toBeNull()
    expect(await nowPlayingRow(t, alice.userId)).toBeNull()
  })

  it('not strangers', async () => {
    const t = createBackend()
    const { alice } = await aliceWorkingOutToMusic(t)
    const stranger = await userWithUsername(t, 'stranger')
    expect(await stranger.user.query(api.spotify.nowPlayingFor, { userId: alice.userId })).toBeNull()
  })

  it('not across a block, in either direction', async () => {
    for (const blockerIsAlice of [true, false]) {
      const t = createBackend()
      const { alice } = await aliceWorkingOutToMusic(t)
      const bob = await userWithUsername(t, 'bob')
      await makeFriends(t, alice.userId, bob.userId)
      const [blocker, blocked] = blockerIsAlice ? [alice, bob] : [bob, alice]
      await blocker.user.mutation(api.feed.blockUser, { userId: blocked.userId })

      expect(await bob.user.query(api.spotify.nowPlayingFor, { userId: alice.userId })).toBeNull()
      const [friend] = await bob.user.query(api.friends.myFriends, {})
      expect(friend.nowPlaying).toBeNull()
    }
  })

  it('not after the workout is cancelled', async () => {
    const t = createBackend()
    const { alice, workoutId } = await aliceWorkingOutToMusic(t)
    await alice.user.mutation(api.workouts.cancel, { workoutId })
    expect(await nowPlayingRow(t, alice.userId)).toBeNull()
  })
})

describe('the poll loop', () => {
  it('starts with a workout and schedules its next tick', async () => {
    const t = createBackend()
    const { alice, pollToken } = await aliceWorkingOutToMusic(t)
    expect(pollToken).toBeTruthy()
    expect((await nowPlayingRow(t, alice.userId))!.trackName).toBe('Lift Song')

    const scheduled = await t.run(async (ctx) => ctx.db.system.query('_scheduled_functions').collect())
    expect(scheduled.filter((s) => s.name.includes('spotifyApi:poll') && s.state.kind === 'pending'))
      .toHaveLength(2) // the initial kick, plus the tick the manual run scheduled
  })

  it('a retired loop does nothing', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await connect(t, alice.userId)
    await alice.user.mutation(api.workouts.start, {})
    await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken: 'old-loop' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears what was playing when nothing is', async () => {
    const t = createBackend()
    const { alice, pollToken } = await aliceWorkingOutToMusic(t)
    routes = [playingRoute(null, 204)]
    await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken })
    expect(await nowPlayingRow(t, alice.userId)).toBeNull()
  })

  it('gives up on a workout abandoned for over 4 hours', async () => {
    const t = createBackend()
    const { alice, workoutId, pollToken } = await aliceWorkingOutToMusic(t)
    await t.run(async (ctx) => ctx.db.patch(workoutId, { startedAt: Date.now() - 5 * 3600_000 }))
    fetchMock.mockClear()

    await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await nowPlayingRow(t, alice.userId)).toBeNull()
    expect((await connectionOf(t, alice.userId))!.pollToken).toBeUndefined()
  })

  it('refreshes an expiring token and keeps a rotated refresh token', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await connect(t, alice.userId, { expiresAt: Date.now() + 10_000 })
    await alice.user.mutation(api.workouts.start, {})
    const { pollToken } = (await connectionOf(t, alice.userId))!
    routes.push(
      tokenRoute({ access_token: 'fresh', refresh_token: 'rotated', expires_in: 3600 }),
      playingRoute(),
    )

    await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken: pollToken! })
    const connection = (await connectionOf(t, alice.userId))!
    expect(connection).toMatchObject({ accessToken: 'fresh', refreshToken: 'rotated' })
    const playingCall = fetchMock.mock.calls.find(([url]) => String(url).includes('currently-playing'))!
    expect((playingCall[1]!.headers as Record<string, string>).Authorization).toBe('Bearer fresh')
  })

  it('drops the connection when Spotify revokes the grant', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    await connect(t, alice.userId, { expiresAt: Date.now() - 1 })
    await alice.user.mutation(api.workouts.start, {})
    const { pollToken } = (await connectionOf(t, alice.userId))!
    routes.push(tokenRoute({ error: 'invalid_grant' }, 400))

    await t.action(internal.spotifyApi.poll, { userId: alice.userId, pollToken: pollToken! })
    expect(await connectionOf(t, alice.userId)).toBeNull()
  })
})

describe('account deletion', () => {
  it('purges the Spotify rows', async () => {
    const t = createBackend()
    const { alice } = await aliceWorkingOutToMusic(t)
    await alice.user.mutation(api.spotify.startConnect, {})
    await t.mutation(internal.account.purgeAccountData, { userId: alice.userId })
    await t.run(async (ctx) => {
      expect(await ctx.db.query('spotifyConnections').collect()).toEqual([])
      expect(await ctx.db.query('spotifyOAuthStates').collect()).toEqual([])
      expect(await ctx.db.query('spotifyNowPlaying').collect()).toEqual([])
    })
  })
})

import { v } from 'convex/values'
import { httpAction, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { envVar } from './env'
import { spotifyConfig } from './spotify'

// The two parts of the Spotify integration that talk to Spotify: the OAuth
// callback and the now-playing poll loop. Everything they store goes through
// internal mutations in spotify.ts.

const POLL_INTERVAL_MS = 30_000
// Abandoned workouts never get an endedAt, so the loop gives up on its own.
const MAX_WORKOUT_MS = 4 * 60 * 60 * 1000
const REFRESH_MARGIN_MS = 60_000

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string }

async function requestToken(body: Record<string, string>): Promise<TokenResponse | 'rejected' | null> {
  const config = spotifyConfig()
  if (!config) return null
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
    },
    body: new URLSearchParams(body),
  })
  // 400 is Spotify refusing the code or grant (expired, revoked, reused).
  if (res.status === 400) return 'rejected'
  if (!res.ok) return null
  return (await res.json()) as TokenResponse
}

// ---------- OAuth callback ----------

export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const appUrl = envVar('SITE_URL') ?? ''
  const back = (result: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/profile?spotify=${result}` },
    })

  const config = spotifyConfig()
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!config || !state) return back('error')

  // Consumed before anything else, so a state can never be replayed, even
  // when the user cancelled on Spotify's page.
  const userId = await ctx.runMutation(internal.spotify.consumeState, { state })
  if (!userId) return back('error')
  if (url.searchParams.get('error') === 'access_denied') return back('cancelled')
  if (!code) return back('error')

  const tokens = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  })
  if (tokens === null || tokens === 'rejected' || !tokens.refresh_token) return back('error')

  const me = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  // Development Mode answers 403 for a Spotify account that isn't on the
  // app's User Management list.
  if (me.status === 403) return back('not_allowed')
  if (!me.ok) return back('error')
  const profile = (await me.json()) as { id: string; display_name?: string | null }

  await ctx.runMutation(internal.spotify.saveConnection, {
    userId,
    spotifyUserId: profile.id,
    displayName: profile.display_name || profile.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  })
  return back('connected')
})

// ---------- now-playing poll loop ----------

type PollContext = {
  connection: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    pollToken: string | null
  } | null
  workoutStartedAt: number | null
}

type CurrentlyPlaying = {
  is_playing: boolean
  context: { type: string; external_urls?: { spotify?: string } } | null
  item: {
    type: string
    id: string
    name: string
    artists?: { name: string }[]
    album?: { images?: { url: string; width?: number | null }[] }
    external_urls?: { spotify?: string }
  } | null
}

function toTrack(body: CurrentlyPlaying) {
  const item = body.item
  // Podcasts and ads aren't something to play along to.
  if (!item || item.type !== 'track' || !item.external_urls?.spotify) return null
  // Spotify lists images largest first; take the smallest that's still crisp.
  const images = item.album?.images ?? []
  const art = [...images].reverse().find((img) => (img.width ?? 0) >= 200) ?? images[0]
  const contextUrl = body.context?.external_urls?.spotify
  return {
    trackId: item.id,
    trackName: item.name,
    artists: (item.artists ?? []).map((a) => a.name).join(', '),
    ...(art ? { albumArtUrl: art.url } : {}),
    trackUrl: item.external_urls.spotify,
    ...(contextUrl ? { contextUrl, contextType: body.context!.type } : {}),
    isPlaying: body.is_playing,
  }
}

// One tick: read what's playing, store it, and schedule the next tick. Only
// the loop holding the connection's current pollToken may run, so a restart
// (a new workout, a reconnect) quietly retires the old loop.
export const poll = internalAction({
  args: { userId: v.id('users'), pollToken: v.string() },
  // Annotated: the handler schedules itself, which TypeScript can't infer.
  handler: async (ctx, { userId, pollToken }): Promise<null> => {
    const context: PollContext = await ctx.runQuery(internal.spotify.pollContext, { userId })
    const { connection, workoutStartedAt } = context
    if (!connection || connection.pollToken !== pollToken) return null
    const stop = async (revoked?: boolean): Promise<null> => {
      await ctx.runMutation(internal.spotify.stopPolling, { userId, pollToken, revoked })
      return null
    }
    if (workoutStartedAt === null || Date.now() - workoutStartedAt > MAX_WORKOUT_MS) {
      return await stop()
    }

    let accessToken = connection.accessToken
    const refresh = async () => {
      const tokens = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      })
      if (tokens === 'rejected') return 'revoked' as const
      if (tokens === null) return 'failed' as const
      accessToken = tokens.access_token
      await ctx.runMutation(internal.spotify.saveTokens, {
        userId,
        accessToken,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      })
      return 'ok' as const
    }

    let delay = POLL_INTERVAL_MS
    try {
      if (connection.expiresAt - REFRESH_MARGIN_MS < Date.now()) {
        const result = await refresh()
        if (result === 'revoked') return await stop(true)
      }

      const read = () =>
        fetch('https://api.spotify.com/v1/me/player/currently-playing', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      let res = await read()
      if (res.status === 401) {
        const result = await refresh()
        if (result === 'revoked') return await stop(true)
        res = await read()
        if (res.status === 401) return await stop(true)
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'))
        delay = Math.max(POLL_INTERVAL_MS, (Number.isFinite(retryAfter) ? retryAfter : 60) * 1000)
      } else if (res.status === 204 || res.ok) {
        const track = res.status === 204 ? null : toTrack((await res.json()) as CurrentlyPlaying)
        const keepGoing: boolean = await ctx.runMutation(internal.spotify.writeNowPlaying, {
          userId,
          pollToken,
          track,
        })
        if (!keepGoing) return null
      }
      // Any other status (Spotify having a bad moment): try again next tick.
    } catch (error) {
      console.error('Spotify poll failed', error)
    }
    await ctx.scheduler.runAfter(delay, internal.spotifyApi.poll, { userId, pollToken })
    return null
  },
})

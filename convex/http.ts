import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { callback as spotifyCallback } from './spotifyApi'

// Convex Auth registers HTTP endpoints (e.g. token exchange) on our deployment.
const http = httpRouter()
auth.addHttpRoutes(http)

// Where Spotify sends the browser back after the user approves (or cancels)
// the connection. Register `${CONVEX_SITE_URL}/spotify/callback` as a
// redirect URI in the Spotify app for each deployment.
http.route({ path: '/spotify/callback', method: 'GET', handler: spotifyCallback })

export default http

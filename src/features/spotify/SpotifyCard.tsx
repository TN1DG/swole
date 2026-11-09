import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { GlassCard } from '../../components/GlassCard'
import { errorMessage } from '../../lib/errors'

// What the OAuth callback reports back via ?spotify=… on /profile.
const RESULT_MESSAGES: Record<string, string> = {
  connected: 'Spotify connected. Friends will see what you play while you work out.',
  cancelled: 'Spotify wasn’t connected.',
  not_allowed:
    'That Spotify account isn’t on Swole’s invite list yet. Ask for it to be added, then try again.',
  error: 'Couldn’t connect Spotify. Please try again.',
}

// Profile → Spotify. Only shown to accounts on the invite list, or ones
// already connected (so they can always disconnect).
export function SpotifyCard() {
  const status = useQuery(api.spotify.status)
  const startConnect = useMutation(api.spotify.startConnect)
  const disconnect = useMutation(api.spotify.disconnect)
  const [searchParams, setSearchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const result = searchParams.get('spotify')
  const resultMessage = result ? (RESULT_MESSAGES[result] ?? RESULT_MESSAGES.error) : null

  if (!status || (!status.canConnect && !status.connected)) return null

  function dismissResult() {
    const next = new URLSearchParams(searchParams)
    next.delete('spotify')
    setSearchParams(next, { replace: true })
  }

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await startConnect())
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t start connecting Spotify.'))
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    setError(null)
    try {
      await disconnect()
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t disconnect Spotify.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>Spotify</Typography>
          <Typography variant="body2" color="text.secondary">
            {status.connected
              ? `Connected as ${status.displayName}. Friends see what you play during workouts.`
              : 'Show friends what you’re playing while you work out, so they can play along.'}
          </Typography>
        </Box>
        {status.connected ? (
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            disabled={busy}
            onClick={handleDisconnect}
            sx={{ flexShrink: 0 }}
          >
            Disconnect
          </Button>
        ) : (
          <Button variant="contained" size="small" disabled={busy} onClick={connect} sx={{ flexShrink: 0 }}>
            Connect
          </Button>
        )}
      </Box>
      {resultMessage && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Typography
            variant="body2"
            color={result === 'connected' ? 'success.main' : 'text.secondary'}
            sx={{ flex: 1 }}
          >
            {resultMessage}
          </Typography>
          <Button size="small" color="inherit" onClick={dismissResult} sx={{ flexShrink: 0, minWidth: 0 }}>
            OK
          </Button>
        </Box>
      )}
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </GlassCard>
  )
}

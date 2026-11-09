import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { GlassTile } from '../../components/GlassTile'
import { isFreshNowPlaying } from './freshness'

const CONTEXT_LABELS: Record<string, string> = {
  playlist: 'Open playlist',
  album: 'Open album',
  artist: 'Open artist',
}

// The track a user is playing during their active workout. Renders nothing
// when there isn't one, or when the viewer isn't allowed to see it. `isSelf`
// is the lifter's own preview of what friends see, without the play buttons.
export function NowPlayingCard({ userId, isSelf = false }: { userId: Id<'users'>; isSelf?: boolean }) {
  const playing = useQuery(api.spotify.nowPlayingFor, { userId })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!playing || !isFreshNowPlaying(playing.updatedAt, now)) return null
  const contextLabel = playing.contextType ? CONTEXT_LABELS[playing.contextType] : undefined

  return (
    <GlassTile sx={{ mt: 2, p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center' }}>
      {playing.albumArtUrl && (
        <Box
          component="img"
          src={playing.albumArtUrl}
          alt=""
          sx={{ width: 64, height: 64, borderRadius: '8px', flexShrink: 0, objectFit: 'cover' }}
        />
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
          {isSelf ? 'Friends see you playing' : 'Working out to'}
          {playing.isPlaying ? '' : ' · paused'}
        </Typography>
        <Typography noWrap sx={{ fontWeight: 600 }}>
          {playing.trackName}
        </Typography>
        <Typography noWrap variant="body2" color="text.secondary">
          {playing.artists}
        </Typography>
        {!isSelf && (
          <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              component="a"
              href={playing.trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              size="small"
            >
              Open in Spotify
            </Button>
            {playing.contextUrl && contextLabel && (
              <Button
                component="a"
                href={playing.contextUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="outlined"
                color="inherit"
                size="small"
              >
                {contextLabel}
              </Button>
            )}
          </Box>
        )}
      </Box>
    </GlassTile>
  )
}

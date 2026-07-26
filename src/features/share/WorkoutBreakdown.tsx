import { Box, Typography } from '@mui/material'
import { formatDuration, formatKg } from '../../../convex/fitness'

type Line = {
  id: string
  name: string
  setCount: number
  top: { weightKg: number; reps: number } | undefined
  isPr: boolean
}

// The summary row (duration/volume/sets/PRs) + per-exercise set×weight×rep
// breakdown — identical between the owner's ShareCard and a friend's
// FriendTrophyCard; only what's rendered around it (title, photo) differs.
// This is captured to a PNG via modern-screenshot (see ShareCard.tsx) — text
// colors are hardcoded white/white-alpha (not theme-driven) since the card
// always renders on a dark background regardless of the app's own theme.
export function WorkoutBreakdown({
  durationMs,
  volumeKg,
  setCount,
  prCount,
  lines,
}: {
  durationMs: number
  volumeKg: number
  setCount: number
  prCount: number
  lines: Line[]
}) {
  const shown = lines.slice(0, 6)

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, fontSize: '0.875rem', color: '#fff' }}>
        <span>⏱ {formatDuration(durationMs)}</span>
        <span>🏋 {formatKg(volumeKg)} kg</span>
        <span>{setCount} sets</span>
        {prCount > 0 && (
          <Box component="span" sx={{ fontWeight: 600, color: '#fbbf24' }}>
            🏆 {prCount} PR{prCount > 1 ? 's' : ''}
          </Box>
        )}
      </Box>

      <Box sx={{ mt: 1.5, borderTop: '1px solid rgb(255 255 255 / 0.2)', pt: 1 }}>
        {shown.map((line) => (
          <Box key={line.id} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', py: 0.25 }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: '#fff' }}>
              {line.setCount} × {line.name}
              {line.isPr && ' 🏆'}
            </Typography>
            {line.top && line.top.weightKg > 0 && (
              <Typography sx={{ fontSize: '0.875rem', color: 'rgb(255 255 255 / 0.8)' }}>
                {formatKg(line.top.weightKg)} kg × {line.top.reps}
              </Typography>
            )}
          </Box>
        ))}
        {lines.length > shown.length && (
          <Typography sx={{ pt: 0.5, fontSize: '0.75rem', color: 'rgb(255 255 255 / 0.6)' }}>
            + {lines.length - shown.length} more exercises
          </Typography>
        )}
      </Box>
    </>
  )
}

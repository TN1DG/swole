import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'
import { computeShareStats } from './shareStats'
import { WorkoutBreakdown } from './WorkoutBreakdown'
import { TRANSPARENT_ICON_SX, TRANSPARENT_TEXT_SX, type CardVariant } from './cardVariant'
import { tokens } from '../../theme/tokens'

type Detail = NonNullable<FunctionReturnType<typeof api.history.getDetail>>

type Props = {
  detail: Detail
  photoUrl: string | null
  variant?: CardVariant
}

// The 9:16 frame that gets exported as the share image. Everything visual
// lives here so the preview and the exported PNG are identical. Captured to
// a PNG via modern-screenshot (see SharePage.tsx's domToBlob call) — colors
// are hardcoded (tokens.*, white/white-alpha) rather than theme-driven,
// since this card always renders dark-on-dark or overlaid on a photo
// regardless of the app's own theme.
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  { detail, photoUrl, variant = 'card' },
  ref,
) {
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)

  // Transparent keeps the *geometry* identical and only drops the paint —
  // padding and the 9:16 frame stay, because the export scale is derived
  // from the node's rendered width (see useCardExport).
  const transparent = variant === 'transparent'
  const legibilitySx = transparent ? TRANSPARENT_TEXT_SX : null

  // The stats block is identical either way — only what's behind it differs.
  const stats = (
    <>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '1.125rem', fontWeight: 900, color: '#fff' }}>{detail.name}</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'rgb(255 255 255 / 0.7)' }}>
          {formatShortDate(detail.startedAt)}
        </Typography>
      </Box>

      <Box sx={{ mt: 1 }}>
        <WorkoutBreakdown
          durationMs={durationMs}
          volumeKg={volumeKg}
          setCount={setCount}
          prCount={detail.prExerciseIds.length}
          lines={lines}
        />
      </Box>
    </>
  )

  // No photo: export just the card itself — no background frame behind it.
  if (!photoUrl) {
    return (
      <Box
        ref={ref}
        sx={{
          width: '100%',
          borderRadius: '16px',
          bgcolor: transparent ? 'transparent' : tokens.surface,
          color: '#fff',
          p: 2,
          ...legibilitySx,
        }}
      >
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: tokens.accent }}>
          <Box sx={{ display: 'flex', ...(transparent ? TRANSPARENT_ICON_SX : null) }}>
            <BarbellIcon size={20} />
          </Box>
          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Swole
          </Typography>
        </Box>
        {stats}
      </Box>
    )
  }

  // Photo added: the full 9:16 frame, stats overlaid bottom-anchored like Hevy.
  // Transparent drops the dark scrim so the stats sit straight on the photo,
  // leaning on the text shadow instead.
  return (
    <Box
      ref={ref}
      sx={{
        position: 'relative',
        aspectRatio: '9 / 16',
        width: '100%',
        overflow: 'hidden',
        bgcolor: transparent ? 'transparent' : tokens.bg,
      }}
    >
      <Box
        component="img"
        src={photoUrl}
        alt=""
        sx={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }}
      />
      <Box
        sx={{
          position: 'absolute',
          insetInline: 12,
          bottom: 12,
          borderRadius: '16px',
          color: '#fff',
          p: 2,
          ...(transparent
            ? TRANSPARENT_TEXT_SX
            : { bgcolor: 'rgb(0 0 0 / 0.7)', backdropFilter: 'blur(4px)' }),
        }}
      >
        {stats}
      </Box>
    </Box>
  )
})

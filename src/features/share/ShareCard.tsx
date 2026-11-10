import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { computeShareStats } from './shareStats'
import { WorkoutBreakdown } from './WorkoutBreakdown'
import { CardFrame } from './CardFrame'
import type { CardVariant } from './cardVariant'
import { FORMAT_MAX_LINES, type CardFormat } from './cardFormat'

type Detail = NonNullable<FunctionReturnType<typeof api.history.getDetail>>

type Props = {
  detail: Detail
  photoUrl: string | null
  variant?: CardVariant
  format?: CardFormat
}

// The owner's share image: their workout's stats, optionally over a photo
// they took. The frame, formats and paint live in CardFrame; this is only
// what goes in the panel. Exported to PNG by useCardExport.
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  { detail, photoUrl, variant = 'card', format = 'story' },
  ref,
) {
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)

  return (
    <CardFrame ref={ref} format={format} variant={variant} photoUrl={photoUrl}>
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
          maxLines={FORMAT_MAX_LINES[format]}
        />
      </Box>
    </CardFrame>
  )
})

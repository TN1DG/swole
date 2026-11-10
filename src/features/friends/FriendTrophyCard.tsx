import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { TIER_LABELS } from '../../lib/tierLabels'
import { computeShareStats } from '../share/shareStats'
import { WorkoutBreakdown } from '../share/WorkoutBreakdown'
import { CardFrame } from '../share/CardFrame'
import type { CardVariant } from '../share/cardVariant'
import { FORMAT_MAX_LINES, type CardFormat } from '../share/cardFormat'
import { brandTokens as tokens } from '../../theme/tokens'

type Detail = NonNullable<FunctionReturnType<typeof api.friends.getFriendWorkoutDetail>>

// A friend's stats-only export of someone else's workout. Never has a photo
// (the friend wasn't there): owner identity + consistency tier up top, then
// the same breakdown the owner's own card shows. Frame and formats come from
// CardFrame, shared with ShareCard.
export const FriendTrophyCard = forwardRef<
  HTMLDivElement,
  { detail: Detail; variant?: CardVariant; format?: CardFormat }
>(function FriendTrophyCard({ detail, variant = 'card', format = 'story' }, ref) {
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)
  const tierLabel = TIER_LABELS[detail.consistency.tier]

  return (
    <CardFrame ref={ref} format={format} variant={variant}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography noWrap sx={{ fontSize: '1.125rem', fontWeight: 900, color: '#fff' }}>
          {detail.owner.displayName}
        </Typography>
        {tierLabel && (
          <Typography sx={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, color: tokens.accent }}>
            {tierLabel}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', color: 'rgb(255 255 255 / 0.8)' }}>
        <Typography noWrap sx={{ fontSize: '0.875rem', color: 'inherit' }}>
          {detail.name}
        </Typography>
        <Typography sx={{ flexShrink: 0, fontSize: '0.75rem', color: 'rgb(255 255 255 / 0.7)' }}>
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

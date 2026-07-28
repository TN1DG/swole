import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Typography } from '@mui/material'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'
import { TIER_LABELS } from '../../lib/tierLabels'
import { computeShareStats } from '../share/shareStats'
import { WorkoutBreakdown } from '../share/WorkoutBreakdown'
import {
  TRANSPARENT_ICON_SX,
  TRANSPARENT_TEXT_SX,
  type CardVariant,
} from '../share/cardVariant'
import { tokens } from '../../theme/tokens'

type Detail = NonNullable<FunctionReturnType<typeof api.friends.getFriendWorkoutDetail>>

// A friend's stats-only export of someone else's workout — never has a
// photo (the friend wasn't there), so unlike ShareCard this has only one
// layout: owner identity + consistency tier up top, then the same set ×
// weight × rep breakdown the owner's own card shows. Captured to a PNG via
// modern-screenshot (see FriendTrophyPage.tsx) — colors hardcoded, same
// reasoning as ShareCard.tsx.
export const FriendTrophyCard = forwardRef<
  HTMLDivElement,
  { detail: Detail; variant?: CardVariant }
>(function FriendTrophyCard({ detail, variant = 'card' }, ref) {
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)
  const tierLabel = TIER_LABELS[detail.consistency.tier]
  const transparent = variant === 'transparent'

  return (
    <Box
      ref={ref}
      sx={{
        width: '100%',
        borderRadius: '16px',
        bgcolor: transparent ? 'transparent' : tokens.surface,
        color: '#fff',
        p: 2,
        ...(transparent ? TRANSPARENT_TEXT_SX : null),
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
        />
      </Box>
    </Box>
  )
})

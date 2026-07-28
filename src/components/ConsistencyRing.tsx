import { consistencyTier } from '../../convex/fitness'
import type { ConsistencyTier } from '../../convex/fitness'
import { ProgressRing } from './ProgressRing'

// [tier's first week, weeks until the next tier]. Re-anchored to 2/4/7/10 so
// Iron Will begins exactly where the streak multiplier stops growing.
const TIER_BOUNDS: Record<ConsistencyTier, [number, number]> = {
  none: [0, 2],
  consistent: [2, 2],
  dedicated: [4, 3],
  relentless: [7, 3],
  iron_will: [10, 0],
}

function ringProgress(streakWeeks: number): number {
  const tier = consistencyTier(streakWeeks)
  // Iron Will is the top: the ring stays full rather than wrapping. It used
  // to be `(offset % span) / span`, which drew week 12 and week 16 as an
  // identical *empty* ring — the top tier appeared to reset every four weeks,
  // which reads as losing progress rather than holding it.
  if (tier === 'iron_will') return 1
  const [start, span] = TIER_BOUNDS[tier]
  return (streakWeeks - start) / span
}

const RING_COLORS: Record<ConsistencyTier, string> = {
  none: '#6B7280',
  consistent: '#FCA5A5',
  dedicated: '#EF4444',
  relentless: '#B91C1C',
  iron_will: '#7F1D1D',
}

export function ConsistencyRing({
  streakWeeks,
  size = 40,
  capped = false,
  className,
}: {
  streakWeeks: number
  size?: number
  /**
   * The streak hit the leaderboard's lookback window and may actually be
   * longer. Renders "10+" rather than claiming a precise number the read
   * couldn't establish.
   */
  capped?: boolean
  className?: string
}) {
  const tier = consistencyTier(streakWeeks)

  return (
    <ProgressRing
      progress={ringProgress(streakWeeks)}
      color={RING_COLORS[tier]}
      size={size}
      label={capped ? `${streakWeeks}+` : String(streakWeeks)}
      className={className}
    />
  )
}

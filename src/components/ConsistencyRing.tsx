import { consistencyTier } from '../../convex/fitness'
import type { ConsistencyTier } from '../../convex/fitness'
import { ProgressRing } from './ProgressRing'

const TIER_BOUNDS: Record<ConsistencyTier, [number, number]> = {
  none: [0, 2],
  consistent: [2, 2],
  dedicated: [4, 4],
  relentless: [8, 4],
  iron_will: [12, 4],
}

function ringProgress(streakWeeks: number): number {
  const tier = consistencyTier(streakWeeks)
  const [start, span] = TIER_BOUNDS[tier]
  const offset = streakWeeks - start
  return tier === 'iron_will' ? (offset % span) / span : offset / span
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
  className,
}: {
  streakWeeks: number
  size?: number
  className?: string
}) {
  const tier = consistencyTier(streakWeeks)

  return (
    <ProgressRing
      progress={ringProgress(streakWeeks)}
      color={RING_COLORS[tier]}
      size={size}
      label={String(streakWeeks)}
      className={className}
    />
  )
}

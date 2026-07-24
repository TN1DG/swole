import { consistencyTier } from '../../convex/fitness'
import type { ConsistencyTier } from '../../convex/fitness'

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
  const progress = ringProgress(streakWeeks)
  const strokeWidth = size * 0.1
  const radius = size / 2 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  return (
    <svg width={size} height={size} className={className} aria-hidden>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#374151"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={RING_COLORS[tier]}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.28}
        fontWeight="700"
        fill="currentColor"
      >
        {streakWeeks}
      </text>
    </svg>
  )
}

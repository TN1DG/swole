import { motion, useReducedMotion } from 'framer-motion'

// Generic SVG progress ring — two circles (track + progress arc) with the
// stroke-dasharray/dashoffset trick, rotated to start at 12 o'clock. Domain
// logic (what progress/color means) lives with the caller; see
// ConsistencyRing.tsx for the streak-tier-flavored wrapper around this.
export function ProgressRing({
  progress,
  color,
  trackColor = '#374151',
  size = 40,
  label,
  className,
  // Opt-in: animates the arc filling in from empty on mount, rather than
  // rendering at its final value immediately. Default false so existing
  // callers (ConsistencyRing, the leaderboard) are pixel-identical.
  animate = false,
}: {
  progress: number
  color: string
  trackColor?: string
  size?: number
  label?: string
  className?: string
  animate?: boolean
}) {
  const strokeWidth = size * 0.1
  const radius = size / 2 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2
  const clamped = Math.max(0, Math.min(1, progress))
  const targetOffset = circumference * (1 - clamped)
  const prefersReducedMotion = useReducedMotion()
  const shouldAnimate = animate && !prefersReducedMotion

  return (
    <svg width={size} height={size} className={className} aria-hidden>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {shouldAnimate ? (
        <motion.circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={targetOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      {label !== undefined && (
        <text
          x={cx}
          y={cy}
          dominantBaseline="central"
          textAnchor="middle"
          fontSize={size * 0.28}
          fontWeight="700"
          fill="currentColor"
        >
          {label}
        </text>
      )}
    </svg>
  )
}

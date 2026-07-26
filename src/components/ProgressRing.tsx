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
}: {
  progress: number
  color: string
  trackColor?: string
  size?: number
  label?: string
  className?: string
}) {
  const strokeWidth = size * 0.1
  const radius = size / 2 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2
  const clamped = Math.max(0, Math.min(1, progress))

  return (
    <svg width={size} height={size} className={className} aria-hidden>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
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

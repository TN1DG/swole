type Point = { label: string; value: number }

// Minimal SVG line chart: top-set weight per session.
// viewBox coordinates scale to the container width automatically.
export function ProgressChart({ points }: { points: Point[] }) {
  const W = 320
  const H = 140
  const PAD = { top: 14, right: 12, bottom: 22, left: 34 }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Give the line breathing room; avoid a flat line dividing by zero.
  const span = max - min || max || 1
  const lo = Math.max(0, min - span * 0.15)
  const hi = max + span * 0.15

  const x = (i: number) =>
    PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(points.length - 1, 1)
  const y = (v: number) =>
    PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ')
  const best = Math.max(...values)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* min/max gridlines + labels */}
      {[min, max].map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 3"
          />
          <text
            x={PAD.left - 6}
            y={y(v) + 3}
            textAnchor="end"
            fontSize="9"
            fill="currentColor"
            className="text-muted"
          >
            {v}
          </text>
        </g>
      ))}

      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r={p.value === best ? 3.5 : 2.5}
          fill={p.value === best ? 'var(--color-pr)' : 'var(--color-accent)'}
        />
      ))}

      {/* first and last date labels */}
      <text x={x(0)} y={H - 6} fontSize="9" fill="currentColor" className="text-muted">
        {points[0].label}
      </text>
      <text
        x={x(points.length - 1)}
        y={H - 6}
        textAnchor="end"
        fontSize="9"
        fill="currentColor"
        className="text-muted"
      >
        {points[points.length - 1].label}
      </text>
    </svg>
  )
}

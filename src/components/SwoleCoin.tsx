import { tokens } from '../theme/tokens'

// Horse head in profile, drawn to fit a 100x100 viewBox alongside the rim.
// A silhouette rather than a lined illustration so it stays legible at the
// 18px the leaderboard row gives it.
const HORSE_PATH =
  'M 28 82 C 30 68 33 47 43 34 L 42 23 L 49 31 L 52 30 L 55 21 L 60 33 ' +
  'C 65 37 69 43 73 50 C 76 55 78 60 77 64 C 76 68 71 70 67 68 ' +
  'C 64 66 62 64 58 63 C 50 61 44 65 40 71 C 36 77 32 84 28 82 Z'

// Split across the two arcs the way a real coin's legend is. Both halves read
// left-to-right; see `ringGlyphs` for the half-turn the lower arc needs.
const TOP_LEGEND = "HUSTLERS DON'T STOP"
const BOTTOM_LEGEND = 'THEY KEEP GOOOOOOOING'

// Below this the legend is unreadable and just reads as noise on the rim, so
// the coin drops to the medallion alone.
const LEGEND_MIN_SIZE = 64

// Rough advance widths relative to a capital. Without these, equal angular
// slots leave a visible gap either side of narrow glyphs — "DON ' T".
function glyphWidth(ch: string): number {
  if (ch === "'") return 0.34
  if (ch === 'I') return 0.42
  if (ch === ' ') return 0.6
  if ('TYKEPS'.includes(ch)) return 0.92
  return 1
}

/**
 * Lays a string around an arc, one <text> per glyph.
 *
 * Deliberately NOT <textPath>. The coin has to survive the share-card export
 * (modern-screenshot), and this repo already has one recorded incident of
 * that pipeline mis-rendering glyphs — plus textPath is unsupported by a
 * number of SVG rasterizers, so anything that later re-rasterizes these
 * cards server-side would silently drop the legend. Per-glyph transforms are
 * plain geometry that every renderer handles.
 */
function ringGlyphs(
  text: string,
  { radius, fontSize, spread, bottom }: {
    radius: number
    fontSize: number
    spread: number
    bottom: boolean
  },
) {
  const chars = [...text]
  const widths = chars.map(glyphWidth)
  const total = widths.reduce((a, b) => a + b, 0)
  let consumed = 0

  return chars.map((ch, i) => {
    // Centre each glyph in its own proportional slice of the arc.
    const offset = -spread / 2 + (spread * (consumed + widths[i] / 2)) / total
    consumed += widths[i]
    if (ch === ' ') return null

    // 0deg is the top of the coin, positive is clockwise.
    const theta = bottom ? 180 - offset : offset
    const rad = (theta * Math.PI) / 180
    const x = 50 + radius * Math.sin(rad)
    const y = 50 - radius * Math.cos(rad)
    // Glyphs on the lower arc need a further half-turn or they hang upside
    // down once they're past the horizontal.
    const rotation = bottom ? theta + 180 : theta

    return (
      <text
        key={`${ch}-${i}`}
        x={0}
        y={0}
        dy="0.35em"
        fontSize={fontSize}
        fontWeight={700}
        fill={tokens.pr}
        textAnchor="middle"
        transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation.toFixed(2)})`}
      >
        {ch}
      </text>
    )
  })
}

/**
 * The Swole points coin. Replaces the 🪙 emoji that used to stand in for it,
 * which rendered as a different picture on every platform and could not be
 * coloured, sized or exported reliably.
 *
 * Two modes, chosen by `size`: at 64px and up the full coin with its legend;
 * below that just the medallion, because the legend is illegible at
 * leaderboard-row scale and only muddies the rim.
 */
export function SwoleCoin({
  size = 20,
  title,
}: {
  size?: number
  /** Sets an accessible name. Omit to leave the coin decorative. */
  title?: string
}) {
  const withLegend = size >= LEGEND_MIN_SIZE
  // Shrink the horse to clear the legend when it's shown.
  const scale = withLegend ? 0.62 : 0.94

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="50" cy="50" r="48" fill={tokens.surface} stroke={tokens.pr} strokeWidth={3} />
      {withLegend && (
        <>
          <circle cx="50" cy="50" r="34" fill="none" stroke={tokens.pr} strokeWidth={1.1} opacity={0.5} />
          {ringGlyphs(TOP_LEGEND, { radius: 41, fontSize: 7.5, spread: 168, bottom: false })}
          {ringGlyphs(BOTTOM_LEGEND, { radius: 41, fontSize: 7.5, spread: 176, bottom: true })}
        </>
      )}
      <g transform={`translate(50 50) scale(${scale}) translate(-53 -52)`}>
        <path d={HORSE_PATH} fill={tokens.accent} />
      </g>
    </svg>
  )
}

import { tokens } from '../theme/tokens'

// The coin carries TWO marks, picked by size.
//
// Full body at 64px and up: a horse at full gallop with a flowing gold mane
// and tail. Below that it drops to the head, because the galloping figure's
// legs are ~4 units wide in a 100-unit viewBox — at 32px they render as an
// unreadable smudge (verified by rasterizing both). Simplifying a mark as it
// shrinks is what coins and logos do; the alternative is a muddy blob in
// every leaderboard row.

// Galloping body, facing right. Muzzle -> jaw -> throat -> chest -> belly ->
// flank -> croup -> back -> withers -> crest -> poll -> ear -> forehead.
const GALLOP_BODY =
  'M 86 34 C 87 37 86 39.5 83 40.5 C 80 41.5 77 41 74 39 ' +
  'C 71.5 37.5 69.5 36 67.5 34 C 64 38 60 42 56.5 46 ' +
  'C 54.5 49 53.5 52 53.5 55 C 52.5 58.5 48 60.5 43 61 ' +
  'C 37 61.5 30 60.5 25 57.5 C 22 55.5 20.5 53 20.5 49.5 L 20.5 41.5 ' +
  'C 24 39.5 29 39 34 40 C 40 41.5 45.5 42 49 40 C 51 37 54 33.5 58 29.5 ' +
  'C 61.5 26 65.5 23 69.5 21.5 L 71.5 15 L 77 22 C 81 24.5 84 28.5 86 34 Z'

// Stroked rather than outlined: four tapering legs in a splayed gallop are
// far easier to place and tune as centre-lines than as one closed silhouette.
const GALLOP_LEGS = [
  'M 55 51 C 63 56 71 60 78 62', // leading foreleg, reaching forward
  'M 51 53 C 55 61 54 68 49 71', // trailing foreleg, folded under
  'M 25 53 C 19 59 13 64 7 67', // hind leg, driving back
  'M 29 57 C 27 65 26 71 29 77', // hind leg, trailing
]

// Drapes over the crest from the poll and streams back past the withers.
const GALLOP_MANE =
  'M 70 21.5 C 65 23.5 60 27.5 56 32.5 C 52 36.5 48.5 39.5 45 41.5 ' +
  'C 41 43.5 36 44 32 42.5 C 36 40.5 41 39 45 36.5 C 49 34 53 30 57 26 ' +
  'C 61 22.5 65.5 20 70 21.5 Z'

const GALLOP_TAIL =
  'M 23.5 42 C 17 37.5 9 34.5 1 35 C 6.5 38.5 11 42.5 13.5 47 ' +
  'C 8.5 48.5 3.5 52 0 57 C 5 53.5 11 50.5 17 49.5 C 21 48.8 24 46 23.5 42 Z'

// Head in profile — one solid silhouette, which is what keeps it readable
// down to 16px in a leaderboard row.
const HEAD_PATH =
  'M 28 82 C 30 68 33 47 43 34 L 42 23 L 49 31 L 52 30 L 55 21 L 60 33 ' +
  'C 65 37 69 43 73 50 C 76 55 78 60 77 64 C 76 68 71 70 67 68 ' +
  'C 64 66 62 64 58 63 C 50 61 44 65 40 71 C 36 77 32 84 28 82 Z'

// Split across the two arcs the way a real coin's legend is. Both halves read
// left-to-right; see `ringGlyphs` for the half-turn the lower arc needs.
const TOP_LEGEND = "HUSTLERS DON'T STOP"
const BOTTOM_LEGEND = 'THEY KEEP GOOOOOOOING'

// Below this the legend is unreadable and just reads as noise on the rim, and
// the galloping figure's legs blur together — so the coin drops to the head
// alone. Both thresholds are the same number because they fail at the same
// scale; splitting them would mean a third, worse-looking intermediate state.
const FULL_COIN_MIN_SIZE = 64

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
 * At 64px and up: the full coin — a galloping horse with a gold mane and
 * tail, ringed by the legend. Below that: the horse head alone. See
 * FULL_COIN_MIN_SIZE for why it degrades rather than just scaling down.
 */
export function SwoleCoin({
  size = 20,
  title,
}: {
  size?: number
  /** Sets an accessible name. Omit to leave the coin decorative. */
  title?: string
}) {
  const full = size >= FULL_COIN_MIN_SIZE

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

      {full ? (
        <>
          <circle cx="50" cy="50" r="34" fill="none" stroke={tokens.pr} strokeWidth={1.1} opacity={0.5} />
          {ringGlyphs(TOP_LEGEND, { radius: 41, fontSize: 7.5, spread: 168, bottom: false })}
          {ringGlyphs(BOTTOM_LEGEND, { radius: 41, fontSize: 7.5, spread: 176, bottom: true })}
          {/* Scaled to sit inside the legend ring, then nudged to centre the
              figure — the tail streams well left of the body's own midpoint. */}
          <g transform="translate(50 50) scale(0.62) translate(-44 -46)">
            <path d={GALLOP_TAIL} fill={tokens.pr} />
            {GALLOP_LEGS.map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke={tokens.accent}
                strokeWidth={4.5}
                strokeLinecap="round"
              />
            ))}
            <path d={GALLOP_BODY} fill={tokens.accent} />
            <path d={GALLOP_MANE} fill={tokens.pr} />
          </g>
        </>
      ) : (
        <g transform="translate(50 50) scale(0.94) translate(-53 -52)">
          <path d={HEAD_PATH} fill={tokens.accent} />
        </g>
      )}
    </svg>
  )
}

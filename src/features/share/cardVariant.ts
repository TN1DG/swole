import type { SxProps, Theme } from '@mui/material'

/**
 * How an exported card paints its background.
 *
 * 'card'        — the original: an opaque surface behind the stats.
 * 'transparent' — no background at all, so the exported PNG's alpha channel
 *                 survives and the stats can be laid over another photo with
 *                 nothing boxing them in.
 */
export type CardVariant = 'card' | 'transparent'

/**
 * Legibility for the transparent variant.
 *
 * Without a card behind it, text sits directly on whatever the user drops it
 * onto — and the app's palette is built for dark-on-dark. On a bright photo
 * the rust wordmark (#c1541f) and the 60%-white "+N more exercises" line are
 * the first things to disappear.
 *
 * Two shadows on purpose: a tight near-opaque one that keeps thin strokes
 * readable against a busy background, and a wide soft one that separates the
 * whole block from a light one. `text-shadow` is an inherited property, so
 * applying this to the card root covers every descendant — no per-node
 * plumbing, and nothing new to remember when a line of text is added.
 */
export const TRANSPARENT_TEXT_SX: SxProps<Theme> = {
  textShadow: '0 1px 2px rgb(0 0 0 / 0.9), 0 2px 12px rgb(0 0 0 / 0.65)',
}

/**
 * The same treatment for SVG, which `text-shadow` does not touch. Applied to
 * icon wrappers only — putting a drop-shadow on the whole card would
 * double up with the inherited text-shadow above and read as a smudge.
 */
export const TRANSPARENT_ICON_SX: SxProps<Theme> = {
  filter: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.9)) drop-shadow(0 2px 8px rgb(0 0 0 / 0.55))',
}

/**
 * Checkerboard for the on-screen preview.
 *
 * The preview wrapper sits outside the exported node, so this never reaches
 * the PNG. It exists because a transparent card previewed against the app's
 * own dark page looks identical to the opaque one — the user would have no
 * way to tell the toggle did anything until after they exported.
 */
export const CHECKERBOARD_SX: SxProps<Theme> = {
  backgroundColor: '#4a4a4a',
  backgroundImage: [
    'linear-gradient(45deg, #333 25%, transparent 25%)',
    'linear-gradient(-45deg, #333 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, #333 75%)',
    'linear-gradient(-45deg, transparent 75%, #333 75%)',
  ].join(', '),
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
}

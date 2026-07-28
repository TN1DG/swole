import type { CSSObject } from '@mui/material/styles'
import { tokens } from './tokens'

// Re-published as plain CSS custom properties for consumers that can't read
// the MUI theme via React context: ProgressChart.tsx/ProgressRing.tsx/
// CalendarView.tsx (hand-rolled SVG reading var(--color-accent) etc.) and
// the modern-screenshot PNG-export pipeline (ShareCard/WorkoutBreakdown/
// FriendTrophyCard), which snapshots real computed CSS. Same literal values
// as the MUI theme (src/theme/index.ts) — tokens.ts is the single source.
export const globalStyles: CSSObject = {
  ':root': {
    // Horizontal page gutter. A plain 1rem on most phones, but widened to
    // clear the notch/rounded corner when a landscape iPhone reports a
    // left/right safe-area inset. Every full-bleed element (the chat header
    // and composer) cancels this with a negative margin, so it has to be one
    // shared value rather than a hardcoded 16px in each place.
    '--app-gutter-left': 'max(1rem, env(safe-area-inset-left))',
    '--app-gutter-right': 'max(1rem, env(safe-area-inset-right))',
    // Fallbacks only — AppLayout measures the real header/nav and overwrites
    // these on the root element (see useChromeHeights there). Sticky elements
    // that need to sit below the header or above the tab bar read them, so a
    // sane default matters for the first paint before measurement lands.
    '--app-header-h': '61px',
    '--app-nav-h': '76px',
    '--color-bg': tokens.bg,
    '--color-surface': tokens.surface,
    '--color-surface-2': tokens.surface2,
    '--color-border': tokens.border,
    '--color-text': tokens.text,
    '--color-muted': tokens.muted,
    '--color-accent': tokens.accent,
    '--color-accent-fg': tokens.accentFg,
    '--color-success': tokens.success,
    '--color-pr': tokens.pr,
    '--color-error': tokens.error,
  },
  'html, body, #root': {
    minHeight: '100svh',
  },
  html: {
    // Stops iOS Safari inflating body text when the phone is rotated to
    // landscape, which otherwise reflows every list row mid-workout.
    WebkitTextSizeAdjust: '100%',
  },
  body: {
    margin: 0,
    position: 'relative',
    // Removes the grey flash Chrome/Safari on Android paints over every
    // tapped button. MUI already renders its own ripple/hover feedback, so
    // the native highlight is pure double-up.
    WebkitTapHighlightColor: 'transparent',
  },
  // "Abyss" depth: soft rust glow blobs behind everything, using only the
  // existing accent/pr tones. Gradients with transparent stops are cheap (no
  // blur() filter needed) — this is what GlassCard's backdrop-filter
  // actually has to pick up and blur; without it there's nothing behind the
  // glass to see.
  'body::before': {
    content: '""',
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    background: [
      'radial-gradient(ellipse 60% 40% at 20% -10%, rgb(193 84 31 / 0.16), transparent 60%)',
      'radial-gradient(ellipse 50% 35% at 100% 110%, rgb(193 84 31 / 0.1), transparent 60%)',
      'radial-gradient(ellipse 40% 30% at 90% 20%, rgb(217 164 65 / 0.06), transparent 65%)',
    ].join(', '),
  },
  // Faint oxidized-metal grain on top of the glow; subliminal texture, not
  // noise you consciously notice. Both sit behind #root so neither blocks
  // interaction.
  'body::after': {
    content: '""',
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    opacity: 0.05,
    mixBlendMode: 'overlay',
    backgroundImage:
      'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\'><filter id=\'n\'><feTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/></filter><rect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/></svg>")',
  },
  '#root': {
    position: 'relative',
    zIndex: 1,
  },
}

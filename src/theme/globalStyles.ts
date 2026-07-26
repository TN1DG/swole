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
  body: {
    margin: 0,
    position: 'relative',
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

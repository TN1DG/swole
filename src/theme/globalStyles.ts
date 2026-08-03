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
  'html, body': {
    // NOT `overflow: hidden` — pre-auth/onboarding screens (SignInPage,
    // WelcomeCarousel) render outside AppLayout as plain document-flow pages
    // with just a `minHeight`, and rely on the document itself being
    // scrollable when their content (e.g. the stats form with the keyboard
    // open) is taller than one viewport. The app shell (see AppLayout) is
    // `position: fixed; inset: 0` instead — out of document flow entirely,
    // so it never contributes to body's scrollable height, meaning there's
    // nothing for the document to scroll *while the shell is mounted*
    // without needing to ban document scrolling globally.
    // `overscroll-behavior: none` kills rubber-band bounce past a scroll
    // boundary; the matching bg color is a last-resort fallback for any
    // sliver still visible through Safari's own chrome during that bounce.
    overscrollBehavior: 'none',
    backgroundColor: tokens.bg,
  },
  html: {
    // Stops iOS Safari inflating body text when the phone is rotated to
    // landscape, which otherwise reflows every list row mid-workout.
    WebkitTextSizeAdjust: '100%',
    // Reserves the scrollbar's width permanently, whether or not the current
    // page actually scrolls. Without this, the floating bottom nav (centered
    // via `mx: auto` inside a fixed, viewport-wide bar) re-centers a few
    // pixels differently between a tall page (scrollbar present) and a short
    // one (no scrollbar) — the "nav jumps between pages" bug. No effect on
    // mobile, where scrollbars already overlay content at zero width.
    scrollbarGutter: 'stable',
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

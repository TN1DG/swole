import { THEME_PRESETS } from './presets'

// Colours that mean something, so they stay the same in every theme.
export const fixedTokens = {
  success: '#7a9a52',
  pr: '#d9a441',
  // No design token existed for this before — error states used Tailwind's
  // ad hoc `red-400`. Same hex, now a real named token.
  error: '#f87171',
} as const

// Swole's own colours, whatever theme the viewer picked. For things that carry
// the brand rather than the user's preference: exported share cards, which
// other people see, and the coin.
export const brandTokens = { ...THEME_PRESETS.rust, ...fixedTokens } as const

// The app's colours for everything else. These are references to the CSS
// variables src/theme/globalStyles.ts publishes for the active preset, so a
// component using them follows the user's theme without knowing it has one, and
// hand-rolled SVG and the PNG-export pipeline can read them with no React
// context. The MUI palette needs real hex values to derive its shades, so it's
// built from the preset itself (src/theme/index.ts).
//
// For a translucent one-off, use the channel variables directly:
// `rgb(var(--color-accent-rgb) / 0.4)`.
export const tokens = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  surface2: 'var(--color-surface-2)',
  border: 'var(--color-border)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  accent: 'var(--color-accent)',
  accentFg: 'var(--color-accent-fg)',
  success: 'var(--color-success)',
  pr: 'var(--color-pr)',
  error: 'var(--color-error)',

  // Alpha-blended "glass" variants — used directly by GlassCard/GlassTile
  // rather than going through the MUI palette (they're translucent overlays,
  // not solid colors a palette slot models well).
  surfaceGlass: 'rgb(var(--color-surface-rgb) / 0.72)',
  surface2Glass: 'rgb(var(--color-surface-2-rgb) / 0.55)',
  borderGlass: 'rgb(var(--color-border-rgb) / 0.55)',
} as const

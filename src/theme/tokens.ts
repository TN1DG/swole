// Single source of truth for the app's color palette — gunmetal/iron base,
// oxidized-rust accent, brass "PR gold". Consumed by both the MUI theme
// (src/theme/index.ts) and the plain CSS custom-property bridge (GlobalStyles
// in src/main.tsx) that hand-rolled SVG (ProgressChart, ProgressRing) and the
// modern-screenshot PNG export pipeline read from directly — those don't have
// access to the MUI theme via React context, so they keep reading real CSS
// vars instead.
export const tokens = {
  bg: '#0a0908',
  surface: '#1e1c19',
  surface2: '#292522',
  border: '#453d35',
  text: '#f0ebe3',
  muted: '#a89a8c',
  accent: '#c1541f',
  accentFg: '#fff7f0',
  success: '#7a9a52',
  pr: '#d9a441',
  // No design token existed for this before — error states used Tailwind's
  // ad hoc `red-400`. Same hex, now a real named token.
  error: '#f87171',

  // Alpha-blended "glass" variants — used directly by GlassCard/GlassTile
  // rather than going through the MUI palette (they're translucent overlays,
  // not solid colors a palette slot models well).
  surfaceGlass: 'rgb(30 28 25 / 0.72)',
  surface2Glass: 'rgb(41 37 34 / 0.55)',
  borderGlass: 'rgb(69 61 53 / 0.55)',
} as const

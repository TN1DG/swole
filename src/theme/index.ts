import { createTheme } from '@mui/material/styles'
import type { ThemePreset } from './presets'
import { fixedTokens } from './tokens'

// Two palette slots the default MUI palette has no home for: the secondary
// "surface2" tile background, and the brass "PR gold" accent used for
// personal-record highlights.
declare module '@mui/material/styles' {
  interface Palette {
    surface2: Palette['primary']
    pr: Palette['primary']
  }
  interface PaletteOptions {
    surface2?: PaletteOptions['primary']
    pr?: PaletteOptions['primary']
  }
}

export const buildTheme = (preset: ThemePreset) => createTheme({
  palette: {
    mode: 'dark',
    background: { default: preset.bg, paper: preset.surface },
    text: { primary: preset.text, secondary: preset.muted },
    primary: { main: preset.accent, contrastText: preset.accentFg },
    success: { main: fixedTokens.success },
    error: { main: fixedTokens.error },
    divider: preset.border,
    surface2: { main: preset.surface2 },
    pr: { main: fixedTokens.pr },
  },
  typography: {
    fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
    // Matches the old `label-micro` utility (uppercase section/stat-tile
    // captions) — callers use `variant="overline" color="text.secondary"`.
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 12, // matches Tailwind's rounded-xl (0.75rem), the app's most common radius
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Prevents iOS Safari from zooming on input focus in the installed
        // PWA — must stay >= 16px regardless of MUI's own field sizing.
        'input, select, textarea, button': { fontSize: '16px' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // MUI's dark mode adds a lightening overlay by elevation by default
        // to fake depth; the app's own glass/tile system already handles
        // depth, so keep Paper flat and let GlassCard/GlassTile set their
        // own backgrounds explicitly.
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // MUI v9 dropped the old combined classKeys (containedPrimary etc.)
        // in favor of composable slots — check ownerState instead.
        root: ({ ownerState }) => ({
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 12,
          // Replaces the old `btn-glow` utility — every contained/primary
          // button gets the rust glow automatically instead of needing the
          // class added by hand at each call site.
          ...(ownerState.variant === 'contained' &&
            ownerState.color === 'primary' && {
              boxShadow: '0 0 0 1px rgb(var(--color-accent-rgb) / 0.4), 0 4px 20px -4px rgb(var(--color-accent-rgb) / 0.45)',
              '&:hover': {
                boxShadow: '0 0 0 1px rgb(var(--color-accent-rgb) / 0.5), 0 4px 24px -4px rgb(var(--color-accent-rgb) / 0.55)',
              },
            }),
        }),
      },
    },
  },
})

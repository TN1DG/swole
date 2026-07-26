import { createTheme } from '@mui/material/styles'
import { tokens } from './tokens'

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

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: tokens.bg, paper: tokens.surface },
    text: { primary: tokens.text, secondary: tokens.muted },
    primary: { main: tokens.accent, contrastText: tokens.accentFg },
    success: { main: tokens.success },
    error: { main: tokens.error },
    divider: tokens.border,
    surface2: { main: tokens.surface2 },
    pr: { main: tokens.pr },
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
              boxShadow: '0 0 0 1px rgb(193 84 31 / 0.4), 0 4px 20px -4px rgb(193 84 31 / 0.45)',
              '&:hover': {
                boxShadow: '0 0 0 1px rgb(193 84 31 / 0.5), 0 4px 24px -4px rgb(193 84 31 / 0.55)',
              },
            }),
        }),
      },
    },
  },
})

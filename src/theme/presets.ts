import { DEFAULT_THEME_PRESET, type ThemePresetId } from '../../convex/themePresets'

// The colours that change with the user's theme. Success, error and PR gold are
// deliberately absent: they mean something, so they stay the same in every
// theme (see `fixedTokens` in tokens.ts).
export type ThemePalette = {
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  muted: string
  accent: string
  accentFg: string
}

export type ThemePreset = ThemePalette & { id: ThemePresetId; label: string }

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  rust: {
    id: 'rust',
    label: 'Rust',
    bg: '#0a0908',
    surface: '#1e1c19',
    surface2: '#292522',
    border: '#453d35',
    text: '#f0ebe3',
    muted: '#a89a8c',
    accent: '#c1541f',
    accentFg: '#fff7f0',
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    bg: '#07090d',
    surface: '#171b22',
    surface2: '#20252e',
    border: '#39424f',
    text: '#e8edf3',
    muted: '#94a2b3',
    accent: '#2274b5',
    accentFg: '#f4faff',
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    bg: '#070a07',
    surface: '#181d18',
    surface2: '#212721',
    border: '#3a453a',
    text: '#e9eee7',
    muted: '#97a596',
    accent: '#2f7f45',
    accentFg: '#f4fff6',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    bg: '#060a0a',
    surface: '#161d1c',
    surface2: '#1f2726',
    border: '#384645',
    text: '#e7efee',
    muted: '#92a6a3',
    accent: '#0f7c74',
    accentFg: '#f1fffd',
  },
  violet: {
    id: 'violet',
    label: 'Violet',
    bg: '#09080d',
    surface: '#1c1a23',
    surface2: '#25222e',
    border: '#413c50',
    text: '#ece9f3',
    muted: '#a29bb3',
    accent: '#7f5ad6',
    accentFg: '#fbf9ff',
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    bg: '#0c0809',
    surface: '#211a1c',
    surface2: '#2b2326',
    border: '#4a3b40',
    text: '#f2e9ec',
    muted: '#ad9aa0',
    accent: '#c73a70',
    accentFg: '#fff8fa',
  },
  mono: {
    id: 'mono',
    label: 'Mono',
    bg: '#0a0a0a',
    surface: '#1c1c1c',
    surface2: '#262626',
    border: '#424242',
    text: '#ededed',
    muted: '#a3a3a3',
    accent: '#e5e5e5',
    accentFg: '#111111',
  },
}

export function presetFor(id: string | null | undefined): ThemePreset {
  return (id && THEME_PRESETS[id as ThemePresetId]) || THEME_PRESETS[DEFAULT_THEME_PRESET]
}

// "#c1541f" -> "193 84 31", the form `rgb(var(--x) / 0.4)` needs.
export function hexToRgbChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

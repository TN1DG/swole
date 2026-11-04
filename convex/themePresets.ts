// Which colour themes exist. Shared by the server (validating what gets saved)
// and the client (src/theme/presets.ts, which has the actual colours). Plain
// data with no Convex functions, like constants.ts.
export const THEME_PRESET_IDS = [
  'rust',
  'ocean',
  'forest',
  'teal',
  'violet',
  'rose',
  'mono',
] as const

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number]

export const DEFAULT_THEME_PRESET: ThemePresetId = 'rust'

export function isThemePresetId(value: string): value is ThemePresetId {
  return (THEME_PRESET_IDS as readonly string[]).includes(value)
}

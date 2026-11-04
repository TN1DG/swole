import { useEffect, useMemo, useState } from 'react'
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { DEFAULT_THEME_PRESET, type ThemePresetId } from '../../convex/themePresets'
import { buildGlobalStyles } from './globalStyles'
import { buildTheme } from './index'
import { presetFor } from './presets'
import { ThemePresetContext, useThemePreset } from './useThemePreset'

const STORAGE_KEY = 'swole.themePreset'

// localStorage rather than waiting on the profile, which only arrives after
// auth and a network round trip: otherwise every launch would flash the default
// colours first. It's only ever a cache of what the account says (see
// ThemeSync). Read before first render because the CSP rules out the usual
// inline <script> in index.html.
function readCachedPreset(): ThemePresetId {
  try {
    return presetFor(localStorage.getItem(STORAGE_KEY)).id
  } catch {
    return DEFAULT_THEME_PRESET // storage blocked, e.g. private browsing
  }
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [presetId, setPresetId] = useState<ThemePresetId>(readCachedPreset)
  const preset = presetFor(presetId)
  const theme = useMemo(() => buildTheme(preset), [preset])
  const globalStyles = useMemo(() => buildGlobalStyles(preset), [preset])
  const context = useMemo(() => ({ presetId, setPresetId }), [presetId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, presetId)
    } catch {
      // Only costs a flash of the default theme on the next launch.
    }
    // The browser/OS chrome around the app.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', preset.bg)
  }, [presetId, preset.bg])

  return (
    <ThemePresetContext.Provider value={context}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles styles={globalStyles} />
        {children}
      </ThemeProvider>
    </ThemePresetContext.Provider>
  )
}

// Rendered once signed in: the account's saved theme wins over this device's
// cache, so a theme follows you to a new device and one account's choice doesn't
// stick to a shared device. Keyed on the saved value changing, so it can't undo
// a swatch tap while that tap's mutation is still in flight.
export function ThemeSync() {
  const profile = useQuery(api.profiles.getMine)
  const { setPresetId } = useThemePreset()
  // No profile (still loading, or mid sign-out) says nothing about the theme.
  // A loaded profile with no saved theme does: this account never chose one.
  const saved = profile ? presetFor(profile.themePreset).id : undefined

  useEffect(() => {
    if (saved !== undefined) setPresetId(saved)
  }, [saved, setPresetId])

  return null
}

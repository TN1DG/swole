import { createContext, useContext } from 'react'
import { DEFAULT_THEME_PRESET, type ThemePresetId } from '../../convex/themePresets'

export const ThemePresetContext = createContext<{
  presetId: ThemePresetId
  setPresetId: (id: ThemePresetId) => void
}>({ presetId: DEFAULT_THEME_PRESET, setPresetId: () => {} })

export const useThemePreset = () => useContext(ThemePresetContext)

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Box, ButtonBase, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { THEME_PRESET_IDS, type ThemePresetId } from '../../../convex/themePresets'
import { GlassCard } from '../../components/GlassCard'
import { errorMessage } from '../../lib/errors'
import { useThemePreset } from '../../theme/useThemePreset'
import { THEME_PRESETS } from '../../theme/presets'

export function ThemePicker() {
  const { presetId, setPresetId } = useThemePreset()
  const saveThemePreset = useMutation(api.profiles.setThemePreset)
  const [error, setError] = useState<string | null>(null)

  // Applied immediately and saved behind it, so tapping through the swatches
  // to compare them never waits on the network.
  async function choose(id: ThemePresetId) {
    setError(null)
    const previous = presetId
    setPresetId(id)
    try {
      await saveThemePreset({ themePreset: id })
    } catch (err) {
      setPresetId(previous)
      setError(errorMessage(err, 'Could not save your theme.'))
    }
  }

  return (
    <GlassCard sx={{ mt: 2 }}>
      <Typography sx={{ fontWeight: 600 }}>Appearance</Typography>
      <Typography variant="body2" color="text.secondary">
        Your colours, on every device you sign in to. Only you see them.
      </Typography>
      <Box
        role="radiogroup"
        aria-label="Colour theme"
        sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 1 }}
      >
        {THEME_PRESET_IDS.map((id) => {
          const preset = THEME_PRESETS[id]
          const selected = id === presetId
          return (
            <ButtonBase
              key={id}
              role="radio"
              aria-checked={selected}
              onClick={() => void choose(id)}
              sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5, borderRadius: '12px' }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${preset.accent} 50%, ${preset.surface2} 50%)`,
                  border: '2px solid',
                  borderColor: selected ? 'text.primary' : 'divider',
                }}
              />
              <Typography
                variant="caption"
                color={selected ? 'text.primary' : 'text.secondary'}
                sx={{ fontWeight: selected ? 600 : 400 }}
              >
                {preset.label}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </GlassCard>
  )
}

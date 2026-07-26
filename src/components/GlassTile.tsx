import { Paper, type PaperProps } from '@mui/material'
import { tokens } from '../theme/tokens'

// Tier B: a repeated list row or nested tile. Tinted like glass but never
// blurred, so it stays cheap no matter how many stack on one screen.
// Replaces the old `glass-tile` Tailwind utility.
export function GlassTile({ sx, ...props }: PaperProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: tokens.surface2Glass,
        // Deliberately a different (lighter) alpha than tokens.borderGlass —
        // matches the original glass-tile utility's own hardcoded border.
        border: '1px solid rgb(69 61 53 / 0.3)',
        borderRadius: '12px',
        ...sx,
      }}
      {...props}
    />
  )
}

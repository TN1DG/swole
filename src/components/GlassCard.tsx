import { Paper, type PaperProps } from '@mui/material'
import { tokens } from '../theme/tokens'

// Tier A: a floating panel — modals, once-per-screen cards. Blurred, so
// reserve this for elements that never repeat many times on one screen
// (backdrop-filter is real compositing cost, stacking it across a dozen
// list rows is the kind of thing that janks on an older phone mid-workout).
// Replaces the old `glass-card` Tailwind utility.
export function GlassCard({ sx, ...props }: PaperProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: tokens.surfaceGlass,
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        border: `1px solid ${tokens.borderGlass}`,
        boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.55), inset 0 1px 0 0 rgb(255 247 240 / 0.05)',
        borderRadius: '16px',
        p: 2,
        ...sx,
      }}
      {...props}
    />
  )
}

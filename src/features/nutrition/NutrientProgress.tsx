import { Box, Typography } from '@mui/material'
import { GlassTile } from '../../components/GlassTile'

// One consumed-vs-target row on the Caloric Consistency page: a label, the
// "consumed / target" numbers, and a clamped progress bar underneath. Reuses
// the GlassTile look CalorieBreakdown's own tiles use, so the two calorie
// screens read as one system.
export function NutrientProgress({
  label,
  unit,
  consumed,
  target,
}: {
  label: string
  unit: string
  consumed: number
  target: number
}) {
  const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0
  return (
    <GlassTile sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(consumed)} / {Math.round(target)} {unit}
        </Typography>
      </Box>
      <Box sx={{ mt: 1, height: 6, borderRadius: '3px', bgcolor: 'surface2.main', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: 'primary.main', borderRadius: '3px' }} />
      </Box>
    </GlassTile>
  )
}

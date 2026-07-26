import { Box, Typography } from '@mui/material'
import { GlassTile } from './GlassTile'

// A labeled number tile with an optional leading icon — used for the small
// stat grids on the post-workout summary and the profile page.
export function StatTile({
  label,
  value,
  icon,
  centered = false,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  centered?: boolean
}) {
  return (
    <GlassTile sx={{ p: 1.5, textAlign: centered ? 'center' : 'left' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: centered ? 'center' : 'flex-start',
          gap: 0.5,
        }}
      >
        {icon}
        <Typography variant="overline" color="text.secondary" component="span">
          {label}
        </Typography>
      </Box>
      <Typography sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }} variant="h6">
        {value}
      </Typography>
    </GlassTile>
  )
}

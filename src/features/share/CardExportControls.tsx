import { Box, Button, Typography } from '@mui/material'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { CardVariant } from './cardVariant'
import { FORMAT_HINTS, FORMAT_OPTIONS, type CardFormat } from './cardFormat'

const VARIANT_HINTS: Record<CardVariant, string> = {
  card: 'A solid card, ready to post as-is.',
  transparent: 'No background — drop it straight onto another photo.',
}

/** Story/Square and Card/Transparent pickers, shared by both card pages. */
export function CardOptions({
  format,
  onFormatChange,
  variant,
  onVariantChange,
}: {
  format: CardFormat
  onFormatChange: (format: CardFormat) => void
  variant: CardVariant
  onVariantChange: (variant: CardVariant) => void
}) {
  return (
    <>
      <Box sx={{ mt: 1.5 }}>
        <SegmentedControl value={format} onChange={onFormatChange} options={FORMAT_OPTIONS} />
      </Box>
      <Box sx={{ mt: 1 }}>
        <SegmentedControl
          value={variant}
          onChange={onVariantChange}
          options={[
            { value: 'card', label: 'Card' },
            { value: 'transparent', label: 'Transparent' },
          ]}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {FORMAT_HINTS[format]} {VARIANT_HINTS[variant]}
      </Typography>
    </>
  )
}

/** Save to Photos (fewest taps) and Share to… (the OS share sheet). */
export function CardExportButtons({
  busy,
  onSave,
  onShare,
}: {
  busy: boolean
  onSave: () => void
  onShare: () => void
}) {
  return (
    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
      <Button variant="contained" fullWidth disabled={busy} onClick={onSave}>
        {busy ? 'Rendering…' : 'Save to Photos'}
      </Button>
      <Button variant="outlined" color="inherit" fullWidth disabled={busy} onClick={onShare}>
        Share to…
      </Button>
    </Box>
  )
}

import { forwardRef, type ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { BarbellIcon } from '../../components/icons'
import { brandTokens as tokens } from '../../theme/tokens'
import { TRANSPARENT_ICON_SX, TRANSPARENT_TEXT_SX, type CardVariant } from './cardVariant'
import { FORMAT_ASPECT, FORMAT_SAFE_AREA, type CardFormat } from './cardFormat'

type Props = {
  format: CardFormat
  variant: CardVariant
  /** A photo fills the frame and the stats panel sits on it, bottom-anchored. */
  photoUrl?: string | null
  children: ReactNode
}

/**
 * The exported frame shared by ShareCard and FriendTrophyCard: a fixed 9:16
 * or 1:1 box (so the PNG is always 1080×1920 or 1080×1080), with the stats
 * panel kept inside the format's safe area.
 *
 * The frame's geometry never depends on the variant: useCardExport derives
 * its export scale from the rendered width, so only paint may change.
 * Colors are hardcoded (tokens.*, white) because the card is always dark,
 * whatever the app's own theme.
 */
export const CardFrame = forwardRef<HTMLDivElement, Props>(function CardFrame(
  { format, variant, photoUrl, children },
  ref,
) {
  const transparent = variant === 'transparent'
  const safe = FORMAT_SAFE_AREA[format]

  const panelPaint = transparent
    ? TRANSPARENT_TEXT_SX
    : photoUrl
      ? { bgcolor: 'rgb(0 0 0 / 0.7)', backdropFilter: 'blur(4px)' }
      : { bgcolor: tokens.surface }

  return (
    <Box
      ref={ref}
      data-format={format}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: FORMAT_ASPECT[format],
        overflow: 'hidden',
        color: '#fff',
        bgcolor: transparent ? 'transparent' : tokens.bg,
      }}
    >
      {photoUrl && (
        <Box
          component="img"
          src={photoUrl}
          alt=""
          sx={{ position: 'absolute', inset: 0, height: '100%', width: '100%', objectFit: 'cover' }}
        />
      )}
      <Box
        sx={{
          position: 'absolute',
          insetInline: 12,
          top: safe.top,
          bottom: safe.bottom,
          display: 'flex',
          flexDirection: 'column',
          // Over a photo the stats sit low, clear of the subject; on their
          // own they're centred in the frame.
          justifyContent: photoUrl ? 'flex-end' : 'center',
        }}
      >
        <Box sx={{ borderRadius: '16px', p: 2, ...panelPaint }}>
          {!photoUrl && (
            <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: tokens.accent }}>
              <Box sx={{ display: 'flex', ...(transparent ? TRANSPARENT_ICON_SX : null) }}>
                <BarbellIcon size={20} />
              </Box>
              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                Swole
              </Typography>
            </Box>
          )}
          {children}
        </Box>
      </Box>
    </Box>
  )
})

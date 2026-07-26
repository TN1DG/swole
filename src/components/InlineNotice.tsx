import type { ReactNode } from 'react'
import { Box, IconButton } from '@mui/material'
import { GlassCard } from './GlassCard'

// Shared shell for a dismissible, single-line notice banner — replaces the
// identical markup previously duplicated between PingAckBanner and
// FirstVisitTip. `action` is an optional call-to-action button rendered
// before the dismiss (✕) button.
export function InlineNotice({
  children,
  onDismiss,
  action,
}: {
  children: ReactNode
  onDismiss: () => void
  action?: ReactNode
}) {
  return (
    <GlassCard
      sx={{
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
        fontSize: '0.875rem',
        borderColor: 'rgb(193 84 31 / 0.3)',
      }}
    >
      <Box sx={{ flex: 1, color: 'text.secondary' }}>{children}</Box>
      {action}
      <IconButton
        size="small"
        onClick={onDismiss}
        aria-label="Dismiss"
        sx={{ color: 'text.secondary', flexShrink: 0 }}
      >
        ✕
      </IconButton>
    </GlassCard>
  )
}

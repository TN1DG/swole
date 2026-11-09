import { Box } from '@mui/material'
import { useVisualViewport } from '../../lib/useVisualViewport'

// The full-screen frame every conversation sits in, in place of the app's
// header and tab bar: a header row, then the thread and composer. Sized to the
// visual viewport so the keyboard pushes the composer up rather than covering
// it. Shared by 1:1 chats (ChatShell) and clan chat (ClanChatPage).
export function ChatFrame({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const viewport = useVisualViewport()
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        mx: 'auto',
        maxWidth: '32rem',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      style={{
        height: viewport ? viewport.height : '100dvh',
        transform: viewport ? `translateY(${viewport.offsetTop}px)` : undefined,
      }}
    >
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          pl: 'max(0.25rem, env(safe-area-inset-left))',
          pr: 'max(0.25rem, env(safe-area-inset-right))',
          pt: 'max(0.5rem, env(safe-area-inset-top))',
          pb: 0.75,
        }}
      >
        {header}
      </Box>
      {children}
    </Box>
  )
}

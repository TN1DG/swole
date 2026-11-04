import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { usePushNotifications } from './usePushNotifications'

const SEEN_TIP = 'chat-push-prompt'

// Asked once, in the moment it's obviously useful: in a conversation, where the
// next thing you want to know is when they reply. Either answer retires it for
// good; after that the setting lives on Profile.
export function PushPrompt({ friendName }: { friendName: string }) {
  const config = useQuery(api.push.getConfig)
  const seenTips = useQuery(api.profiles.getSeenTips)
  const markTipSeen = useMutation(api.profiles.markTipSeen)
  const push = usePushNotifications(config?.publicKey)

  const relevant =
    config?.publicKey &&
    seenTips !== undefined &&
    !seenTips.includes(SEEN_TIP) &&
    push.support === 'supported' &&
    push.enabled === false &&
    push.permission === 'default'

  // Stays up after a failed attempt, so the reason can be read.
  if (!relevant && !push.error) return null

  const dismiss = () => void markTipSeen({ tip: SEEN_TIP })

  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body2">
        {push.error ?? `Get a notification when ${friendName} replies?`}
      </Typography>
      <Box sx={{ mt: 0.5, display: 'flex', gap: 1 }}>
        {!push.error && (
          <Button
            size="small"
            variant="contained"
            disabled={push.busy}
            onClick={() => {
              void push.enable().then(dismiss)
            }}
          >
            Turn on
          </Button>
        )}
        <Button size="small" color="inherit" onClick={dismiss}>
          {push.error ? 'OK' : 'Not now'}
        </Button>
      </Box>
    </Box>
  )
}

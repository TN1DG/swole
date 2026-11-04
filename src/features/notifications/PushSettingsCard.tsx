import { useMutation, useQuery } from 'convex/react'
import { Box, Switch, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { GlassCard } from '../../components/GlassCard'
import { usePushNotifications } from './usePushNotifications'

function Row({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Box component="label" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
      <Box>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      </Box>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        sx={{ flexShrink: 0 }}
      />
    </Box>
  )
}

export function PushSettingsCard() {
  const config = useQuery(api.push.getConfig)
  const setHideMessageText = useMutation(api.push.setHideMessageText)
  const push = usePushNotifications(config?.publicKey)

  // No keys on this deployment means push isn't on offer here at all.
  if (!config?.publicKey) return null

  if (push.support === 'needs-install') {
    return (
      <GlassCard sx={{ mt: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>Notifications</Typography>
        <Typography variant="body2" color="text.secondary">
          To get notifications on iPhone, add Swole to your Home Screen first: tap Share, then
          "Add to Home Screen", and open it from there.
        </Typography>
      </GlassCard>
    )
  }

  if (push.support === 'unsupported') {
    return (
      <GlassCard sx={{ mt: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>Notifications</Typography>
        <Typography variant="body2" color="text.secondary">
          This browser doesn't support notifications.
        </Typography>
      </GlassCard>
    )
  }

  const blocked = push.permission === 'denied' && !push.enabled

  return (
    <GlassCard sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Row
        title="Notifications"
        hint={
          blocked
            ? 'Blocked for this site. You can allow them in your browser settings.'
            : 'Messages, pings, challenges, friend requests and activity on your posts, on this device.'
        }
        checked={push.enabled ?? false}
        disabled={push.busy || push.enabled === undefined || blocked}
        onChange={(on) => void (on ? push.enable() : push.disable())}
      />
      {push.enabled && (
        <Row
          title="Show message text"
          hint="Off shows only who messaged you, which is more private on a lock screen."
          checked={!config.hideMessageText}
          onChange={(show) => void setHideMessageText({ hide: !show })}
        />
      )}
      {push.error && (
        <Typography variant="body2" color="error">
          {push.error}
        </Typography>
      )}
    </GlassCard>
  )
}

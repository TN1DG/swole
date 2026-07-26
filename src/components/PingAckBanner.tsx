import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Button } from '@mui/material'
import { api } from '../../convex/_generated/api'
import { InlineNotice } from './InlineNotice'

// App-wide (mounted once in AppLayout, not per-route) so it shows up
// regardless of what screen the sender is on when their friend acks a ping.
// Tap-to-start, not silent — see convex/pings.ts:getAckPrompt for the
// freshness/dismissal rules that decide whether this renders at all.
export function PingAckBanner() {
  const prompt = useQuery(api.pings.getAckPrompt)
  const start = useMutation(api.workouts.start)
  const dismiss = useMutation(api.pings.dismissPrompt)
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(false)
  const [starting, setStarting] = useState(false)

  if (!prompt || hidden) return null

  async function handleStart() {
    if (!prompt) return
    setStarting(true)
    await Promise.all([
      start({ localHour: new Date().getHours() }),
      dismiss({ pingId: prompt.pingId }),
    ])
    setHidden(true)
    navigate('/')
  }

  return (
    <InlineNotice
      onDismiss={() => {
        setHidden(true)
        void dismiss({ pingId: prompt.pingId })
      }}
      action={
        <Button variant="contained" size="small" disabled={starting} onClick={() => void handleStart()}>
          Start
        </Button>
      }
    >
      Your friend held you accountable — start your workout?
    </InlineNotice>
  )
}

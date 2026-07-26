import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

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
    <div className="mb-4 flex items-center gap-2 rounded-xl glass-card border-accent/30! p-3 text-sm">
      <p className="flex-1 text-muted">Your friend held you accountable — start your workout?</p>
      <button
        type="button"
        disabled={starting}
        onClick={() => void handleStart()}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg btn-glow disabled:opacity-50"
      >
        Start
      </button>
      <button
        type="button"
        onClick={() => {
          setHidden(true)
          void dismiss({ pingId: prompt.pingId })
        }}
        aria-label="Dismiss"
        className="shrink-0 text-muted"
      >
        ✕
      </button>
    </div>
  )
}

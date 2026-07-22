import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

const TIP_COPY = {
  workout: 'Tap Start Empty Workout, or launch straight from a routine below.',
  history: 'Every finished workout lands here — tap one for the full breakdown.',
  favorites: 'Star an exercise anywhere in the app and it shows up here.',
  friends:
    'Add friends by username to see the leaderboard. Two+ weeks training in a row earns your first badge.',
  routines: 'Build a template once — starting it pre-fills every set with your last numbers.',
  exercises: 'Browse the library or add your own — tap one for its PR and history.',
  profile: 'Your stats, settings, and a direct line to the developer.',
} as const

type TabKey = keyof typeof TIP_COPY

// A small, dismissible one-liner shown the first time a user opens a given
// tab. Tracked server-side (profiles.seenTips) rather than in localStorage,
// so it stays dismissed across devices instead of reappearing on a reinstall.
export function FirstVisitTip({ tabKey }: { tabKey: TabKey }) {
  const seenTips = useQuery(api.profiles.getSeenTips)
  const markSeen = useMutation(api.profiles.markTipSeen)
  const [dismissed, setDismissed] = useState(false)

  if (!seenTips || dismissed || seenTips.includes(tabKey)) return null

  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl glass-card border-accent/30! p-3 text-sm">
      <p className="flex-1 text-muted">{TIP_COPY[tabKey]}</p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true)
          void markSeen({ tip: tabKey })
        }}
        aria-label="Dismiss tip"
        className="shrink-0 text-muted"
      >
        ✕
      </button>
    </div>
  )
}

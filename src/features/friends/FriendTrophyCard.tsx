import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'
import { TIER_LABELS } from '../../lib/tierLabels'
import { computeShareStats } from '../share/shareStats'
import { WorkoutBreakdown } from '../share/WorkoutBreakdown'

type Detail = NonNullable<FunctionReturnType<typeof api.friends.getFriendWorkoutDetail>>

// A friend's stats-only export of someone else's workout — never has a
// photo (the friend wasn't there), so unlike ShareCard this has only one
// layout: owner identity + consistency tier up top, then the same set ×
// weight × rep breakdown the owner's own card shows.
export const FriendTrophyCard = forwardRef<HTMLDivElement, { detail: Detail }>(
  function FriendTrophyCard({ detail }, ref) {
    const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
    const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)
    const tierLabel = TIER_LABELS[detail.consistency.tier]

    return (
      <div ref={ref} className="w-full rounded-2xl bg-surface p-4 text-white">
        <div className="mb-3 flex items-center justify-center gap-2 text-accent">
          <BarbellIcon className="h-5 w-5" />
          <span className="text-xs font-black tracking-[0.2em] uppercase">Swole</span>
        </div>

        <div className="flex items-baseline justify-between">
          <p className="truncate text-lg font-black">{detail.owner.displayName}</p>
          {tierLabel && <p className="shrink-0 text-xs font-semibold text-accent">{tierLabel}</p>}
        </div>
        <div className="flex items-baseline justify-between text-white/80">
          <p className="truncate text-sm">{detail.name}</p>
          <p className="shrink-0 text-xs text-white/70">{formatShortDate(detail.startedAt)}</p>
        </div>

        <div className="mt-2">
          <WorkoutBreakdown
            durationMs={durationMs}
            volumeKg={volumeKg}
            setCount={setCount}
            prCount={detail.prExerciseIds.length}
            lines={lines}
          />
        </div>
      </div>
    )
  },
)

import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'
import { computeShareStats } from './shareStats'
import { WorkoutBreakdown } from './WorkoutBreakdown'

type Detail = NonNullable<FunctionReturnType<typeof api.history.getDetail>>

type Props = {
  detail: Detail
  photoUrl: string | null
}

// The 9:16 frame that gets exported as the share image. Everything visual
// lives here so the preview and the exported PNG are identical.
export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  { detail, photoUrl },
  ref,
) {
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const { volumeKg, setCount, lines } = computeShareStats(detail.exercises, detail.prExerciseIds)

  // The stats block is identical either way — only what's behind it differs.
  const stats = (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-black">{detail.name}</p>
        <p className="text-xs text-white/70">{formatShortDate(detail.startedAt)}</p>
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
    </>
  )

  // No photo: export just the card itself — no background frame behind it.
  if (!photoUrl) {
    return (
      <div ref={ref} className="w-full rounded-2xl bg-surface p-4 text-white">
        <div className="mb-3 flex items-center justify-center gap-2 text-accent">
          <BarbellIcon className="h-5 w-5" />
          <span className="text-xs font-black tracking-[0.2em] uppercase">Swole</span>
        </div>
        {stats}
      </div>
    )
  }

  // Photo added: the full 9:16 frame, stats overlaid bottom-anchored like Hevy.
  return (
    <div ref={ref} className="relative aspect-[9/16] w-full overflow-hidden bg-bg">
      <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 p-4 text-white backdrop-blur-sm">
        {stats}
      </div>
    </div>
  )
})

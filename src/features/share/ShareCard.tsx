import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'

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
  const workingSets = detail.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
  const volume = workingSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = detail.exercises.reduce((n, e) => n + e.sets.length, 0)
  const durationMs = (detail.endedAt ?? detail.startedAt) - detail.startedAt
  const prSet = new Set(detail.prExerciseIds)

  // Per exercise: set count + heaviest set for the summary line.
  const lines = detail.exercises.map((entry) => {
    const working = entry.sets.filter((s) => !s.isWarmup)
    const top = working.reduce(
      (a, b) =>
        b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps)
          ? b
          : a,
      working[0] ?? entry.sets[0],
    )
    return {
      id: entry.workoutExerciseId,
      name: entry.exercise.name,
      setCount: entry.sets.length,
      top,
      isPr: prSet.has(entry.exercise._id),
    }
  })
  const shown = lines.slice(0, 6)

  // The stats block is identical either way — only what's behind it differs.
  const stats = (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-black">{detail.name}</p>
        <p className="text-xs text-white/70">{formatShortDate(detail.startedAt)}</p>
      </div>

      {/* Summary stats */}
      <div className="mt-2 flex gap-4 text-sm">
        <span>⏱ {formatDuration(durationMs)}</span>
        <span>🏋 {formatKg(volume)} kg</span>
        <span>{setCount} sets</span>
        {detail.prExerciseIds.length > 0 && (
          <span className="font-semibold text-amber-400">
            🏆 {detail.prExerciseIds.length} PR
            {detail.prExerciseIds.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-white/20 pt-2">
        {shown.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between py-0.5 text-sm">
            <p className="font-medium">
              {line.setCount} × {line.name}
              {line.isPr && ' 🏆'}
            </p>
            {line.top && line.top.weightKg > 0 && (
              <p className="text-white/80">
                {formatKg(line.top.weightKg)} kg × {line.top.reps}
              </p>
            )}
          </div>
        ))}
        {lines.length > shown.length && (
          <p className="pt-1 text-xs text-white/60">
            + {lines.length - shown.length} more exercises
          </p>
        )}
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

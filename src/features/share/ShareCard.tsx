import { forwardRef } from 'react'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatShortDate } from '../../lib/dates'

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

  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden bg-bg ${
        photoUrl ? 'aspect-[9/16]' : 'aspect-square'
      }`}
    >
      {/* Background: the photo, or — no picture taken — a compact branded
          card with a big SWOLE mark instead of a tall empty gradient. */}
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3a2015] via-[#131210] to-[#241f1a]">
          <SwoleMark />
        </div>
      )}

      {/* Overlay card, bottom-anchored like Hevy */}
      <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 p-4 text-white backdrop-blur-sm">
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
            <div
              key={line.id}
              className="flex items-baseline justify-between py-0.5 text-sm"
            >
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
      </div>
    </div>
  )
})

// Big centered wordmark shown instead of an empty gradient when no photo
// was added — the card leans on branding rather than blank space.
function SwoleMark() {
  return (
    <div className="flex flex-col items-center gap-3 text-accent">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className="h-20 w-20 opacity-90"
      >
        <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
      </svg>
      <p className="text-3xl font-black text-text uppercase tracking-[0.2em]">SWOLE</p>
    </div>
  )
}

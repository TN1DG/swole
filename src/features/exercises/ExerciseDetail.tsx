import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { formatKg } from '../../../convex/fitness'
import { formatShortDate } from '../../lib/dates'
import { ExerciseForm } from './ExerciseForm'
import { ProgressChart } from './ProgressChart'

type Props = {
  exercise: Doc<'exercises'>
  record?: { bestWeightKg: number; bestWeightReps: number; bestEst1rm: number }
  onClose: () => void
}

// Bottom sheet: progress chart + PRs + recent sessions for one exercise.
export function ExerciseDetail({ exercise, record, onClose }: Props) {
  const history = useQuery(api.history.exerciseHistory, { exerciseId: exercise._id })
  const [editOpen, setEditOpen] = useState(false)

  const points = (history ?? []).slice(-30).map((s) => ({
    label: formatShortDate(s.startedAt),
    value: s.topWeightKg,
  }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85svh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{exercise.name}</h2>
            <p className="text-sm text-muted">
              {exercise.muscleGroup} · {exercise.equipment}
            </p>
          </div>
          {exercise.isCustom && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted"
            >
              Edit
            </button>
          )}
        </div>

        {/* PR stats */}
        {record && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted uppercase">Best weight</p>
              <p className="mt-1 font-bold">
                🏆 {formatKg(record.bestWeightKg)} kg × {record.bestWeightReps}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted uppercase">Est. 1RM</p>
              <p className="mt-1 font-bold">{formatKg(record.bestEst1rm)} kg</p>
            </div>
          </div>
        )}

        {/* Progress chart */}
        <h3 className="mt-5 text-sm font-semibold tracking-wide text-muted uppercase">
          Top set per session
        </h3>
        {history === undefined ? (
          <p className="mt-3 text-center text-muted">Loading…</p>
        ) : points.length >= 2 ? (
          <div className="mt-2 rounded-xl bg-surface-2 p-2">
            <ProgressChart points={points} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Log this exercise in at least two workouts to see a progress chart.
          </p>
        )}

        {/* Recent sessions */}
        {history && history.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold tracking-wide text-muted uppercase">
              Recent sessions
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {[...history]
                .reverse()
                .slice(0, 5)
                .map((s) => (
                  <li
                    key={s.workoutId}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted">{formatShortDate(s.startedAt)}</span>
                    <span className="font-medium">
                      {formatKg(s.topWeightKg)} kg × {s.topWeightReps}
                    </span>
                    <span className="text-muted">
                      {s.setCount} sets · {formatKg(s.volumeKg)} kg
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}

        {editOpen && (
          <ExerciseForm initial={exercise} onClose={() => setEditOpen(false)} />
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { formatKg } from '../../../convex/fitness'
import { formatShortDate } from '../../lib/dates'
import { BarbellIcon, PlateIcon } from '../../components/icons'
import { ExerciseForm } from './ExerciseForm'
import { ProgressChart } from './ProgressChart'

type Props = {
  exercise: Doc<'exercises'>
  record?: { bestWeightKg: number; bestWeightReps: number; bestEst1rm: number } | null
  onClose: () => void
}

// Bottom sheet: progress chart + PRs + recent sessions for one exercise.
// This is the one place exercise detail is rendered — every screen that
// wants to show a lift's stats opens this instead of building its own.
export function ExerciseDetail({ exercise, record, onClose }: Props) {
  const history = useQuery(api.history.exerciseHistory, { exerciseId: exercise._id })
  const isFavorited = useQuery(api.favorites.isFavorited, { exerciseId: exercise._id })
  const toggleFavorite = useMutation(api.favorites.toggle)
  const [editOpen, setEditOpen] = useState(false)

  const points = (history ?? []).slice(-30).map((s) => ({
    label: formatShortDate(s.startedAt),
    value: s.topWeightKg,
  }))
  // "Compounded lift": total weight ever moved on this exercise, across every session.
  const lifetimeVolumeKg = (history ?? []).reduce((sum, s) => sum + s.volumeKg, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="no-scrollbar flex max-h-[85svh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl glass-card border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">{exercise.name}</h2>
            <p className="text-sm text-muted">
              {exercise.muscleGroup} · {exercise.equipment}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleFavorite({ exerciseId: exercise._id })}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              className="rounded-lg border border-border px-3 py-1.5 text-lg leading-none"
            >
              {isFavorited ? '❤️' : '🤍'}
            </button>
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
        </div>

        {/* PR stats */}
        {record && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl glass-tile p-3">
              <p className="label-micro">Best weight</p>
              <p className="mt-1 font-bold tabular-nums">
                🏆 {formatKg(record.bestWeightKg)} kg × {record.bestWeightReps}
              </p>
            </div>
            <div className="rounded-xl glass-tile p-3">
              <p className="label-micro flex items-center gap-1">
                <BarbellIcon className="h-3.5 w-3.5" /> Est. 1RM
              </p>
              <p className="mt-1 font-bold tabular-nums">{formatKg(record.bestEst1rm)} kg</p>
            </div>
          </div>
        )}
        {lifetimeVolumeKg > 0 && (
          <div className="mt-3 rounded-xl glass-tile p-3">
            <p className="label-micro flex items-center gap-1">
              <PlateIcon className="h-3.5 w-3.5" /> Lifetime volume
            </p>
            <p className="mt-1 font-bold tabular-nums">{formatKg(lifetimeVolumeKg)} kg</p>
          </div>
        )}

        {/* Progress chart */}
        <h3 className="label-micro mt-5">Top set per session</h3>
        {history === undefined ? (
          <p className="mt-3 text-center text-muted">Loading…</p>
        ) : points.length >= 2 ? (
          <div className="mt-2 rounded-xl glass-tile p-2">
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
            <h3 className="label-micro mt-5">Recent sessions</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {[...history]
                .reverse()
                .slice(0, 5)
                .map((s) => (
                  <li
                    key={s.workoutId}
                    className="flex items-center justify-between rounded-xl glass-tile px-3 py-2 text-sm tabular-nums"
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

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { ChecklistIcon, PlateIcon, StopwatchIcon } from '../../components/icons'
import { StatTile } from '../../components/StatTile'
import { ActiveWorkout, type FinishSummary } from './ActiveWorkout'

export function WorkoutsPage() {
  const active = useQuery(api.workouts.getActive)
  const start = useMutation(api.workouts.start)
  const routines = useQuery(api.routines.list)
  const startFromRoutine = useMutation(api.routines.startFromRoutine)
  const [summary, setSummary] = useState<FinishSummary | null>(null)

  if (active === undefined) {
    return <p className="mt-8 text-center text-muted">Loading…</p>
  }

  // A workout is running -> show the logging screen.
  if (active !== null) {
    return <ActiveWorkout workout={active} onFinished={setSummary} />
  }

  // Otherwise: start screen (plus a celebration card right after finishing).
  return (
    <div>
      <h1 className="text-2xl font-bold">Workout</h1>

      {summary && (
        <div className="mt-4 rounded-2xl border border-accent/40 bg-surface p-4">
          {summary.discarded ? (
            <p className="text-muted">Empty workout discarded.</p>
          ) : (
            <>
              <p className="text-lg font-bold">Workout saved! 💪</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <StatTile
                  icon={<StopwatchIcon />}
                  label="Duration"
                  value={formatDuration(summary.durationMs)}
                />
                <StatTile
                  icon={<PlateIcon />}
                  label="Volume"
                  value={`${formatKg(summary.totalVolumeKg)} kg`}
                />
                <StatTile
                  icon={<ChecklistIcon />}
                  label="Sets"
                  value={String(summary.completedSetCount)}
                />
                <StatTile
                  label="New PRs"
                  value={summary.prCount > 0 ? `🏆 ${summary.prCount}` : '—'}
                />
              </div>
            </>
          )}
          {!summary.discarded && (
            <Link
              to={`/share/${summary.workoutId}`}
              className="mt-4 block w-full rounded-xl bg-accent py-2 text-center font-semibold text-accent-fg"
            >
              Share as Photo 📸
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSummary(null)}
            className="mt-3 w-full rounded-xl border border-border py-2 font-semibold text-muted"
          >
            Close
          </button>
        </div>
      )}

      <p className="mt-4 text-muted">Ready to lift?</p>
      <button
        type="button"
        onClick={() => void start({ localHour: new Date().getHours() })}
        className="mt-4 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
      >
        Start Empty Workout
      </button>

      {/* Quick start from a routine */}
      {routines && routines.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold tracking-wide text-muted uppercase">
            Routines
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {routines.map((routine) => (
              <button
                key={routine._id}
                type="button"
                onClick={() => void startFromRoutine({ routineId: routine._id })}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-left"
              >
                <p className="font-semibold">{routine.name}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {routine.exercises
                    .map((ex) => `${ex.targetSets}×${ex.name}`)
                    .join(' · ')}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

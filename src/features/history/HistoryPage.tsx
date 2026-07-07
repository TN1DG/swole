import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatShortDate, formatWorkoutDate } from '../../lib/dates'

export function HistoryPage() {
  const [tab, setTab] = useState<'workouts' | 'records'>('workouts')

  return (
    <div>
      <h1 className="text-2xl font-bold">History</h1>

      {/* Segmented control */}
      <div className="mt-4 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        {(['workouts', 'records'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-semibold capitalize ${
              tab === t ? 'bg-accent text-accent-fg' : 'text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'workouts' ? <WorkoutList /> : <RecordList />}
    </div>
  )
}

function WorkoutList() {
  // Paginated: loads 20 at a time instead of the entire (ever-growing) table.
  const { results: workouts, status, loadMore } = usePaginatedQuery(
    api.history.listCompleted,
    {},
    { initialNumItems: 20 },
  )

  if (status === 'LoadingFirstPage')
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (workouts.length === 0)
    return (
      <p className="mt-8 text-center text-muted">
        No workouts yet — go lift something!
      </p>
    )

  return (
    <div className="mt-4 flex flex-col gap-3">
      {workouts.map((w) => (
        <Link
          key={w._id}
          to={`/history/${w._id}`}
          className="rounded-2xl border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">{w.name}</p>
            <p className="text-sm text-muted">{formatWorkoutDate(w.startedAt)}</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatDuration(w.durationMs)} · {formatKg(w.totalVolumeKg)} kg ·{' '}
            {w.setCount} sets
          </p>
          <ul className="mt-2 text-sm text-muted">
            {w.exercises.slice(0, 4).map((ex, i) => (
              <li key={i}>
                {ex.setCount} × {ex.name}
              </li>
            ))}
            {w.exercises.length > 4 && (
              <li className="text-xs">+ {w.exercises.length - 4} more</li>
            )}
          </ul>
        </Link>
      ))}

      {status !== 'Exhausted' && (
        <button
          type="button"
          onClick={() => loadMore(20)}
          disabled={status === 'LoadingMore'}
          className="rounded-xl border border-border py-3 font-semibold text-muted disabled:opacity-50"
        >
          {status === 'LoadingMore' ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function RecordList() {
  const records = useQuery(api.prs.listMine)

  if (records === undefined)
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (records.length === 0)
    return (
      <p className="mt-8 text-center text-muted">
        Finish a workout to set your first records.
      </p>
    )

  const sorted = [...records].sort((a, b) => b.achievedAt - a.achievedAt)

  return (
    <div className="mt-4 flex flex-col gap-2">
      {sorted.map((r) => (
        <div
          key={r._id}
          className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
        >
          <div>
            <p className="font-medium">{r.exercise?.name ?? '?'}</p>
            <p className="text-sm text-muted">
              🏆 {formatKg(r.bestWeightKg)} kg × {r.bestWeightReps} · est. 1RM{' '}
              {formatKg(r.bestEst1rm)} kg
            </p>
          </div>
          <p className="text-xs text-muted">{formatShortDate(r.achievedAt)}</p>
        </div>
      ))}
    </div>
  )
}

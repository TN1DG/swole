import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'

// Read-only: a friend's (or a public opt-in user's) workout history. Same
// card shape as your own History tab, no drill-down to per-workout detail.
export function FriendWorkoutsPage() {
  const { userId } = useParams()
  const data = useQuery(api.friends.friendWorkouts, { userId: userId as Id<'users'> })

  return (
    <div>
      <Link to="/friends" className="text-sm text-muted">
        ← Friends
      </Link>

      {data === undefined ? (
        <p className="mt-8 text-center text-muted">Loading…</p>
      ) : data === null ? (
        <div className="mt-8 text-center text-muted">
          <p>Can't view this — you're not friends, and their workouts aren't public.</p>
        </div>
      ) : (
        <>
          <h1 className="mt-2 truncate text-2xl font-bold">{data.displayName}</h1>
          {data.workouts.length === 0 ? (
            <p className="mt-8 text-center text-muted">No workouts logged yet.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {data.workouts.map((w) => (
                <div key={w._id} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold">{w.name}</p>
                    <p className="shrink-0 text-sm text-muted">{formatWorkoutDate(w.startedAt)}</p>
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

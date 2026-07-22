import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { TIER_LABELS } from '../../lib/tierLabels'

// Read-only detail for a friend's (or public opt-in user's) workout — same
// set-by-set breakdown as your own WorkoutDetailPage, minus anything that
// implies ownership (no delete button; "Share" becomes "Download Trophy",
// a stats-only card since the friend has no photo from that session).
// Exercise names aren't clickable here (unlike your own history) — the
// ExerciseDetail sheet queries *your* exercise history/favorites, which
// would show the wrong person's data for someone else's workout.
export function FriendWorkoutDetailPage() {
  const { userId, workoutId } = useParams()
  const detail = useQuery(api.friends.getFriendWorkoutDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  if (detail === undefined)
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (detail === null)
    return (
      <div className="mt-8 text-center text-muted">
        <p>Can't view this — you're not friends, and their workouts aren't public.</p>
        <Link to={`/friends/${userId}`} className="text-accent underline">
          Back
        </Link>
      </div>
    )

  const totalVolume = detail.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = detail.exercises.reduce((n, e) => n + e.sets.length, 0)
  const prSet = new Set(detail.prExerciseIds)
  const tierLabel = TIER_LABELS[detail.consistency.tier]

  return (
    <div>
      <Link to={`/friends/${userId}`} className="text-sm text-muted">
        ← {detail.owner.displayName}
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <h1 className="truncate text-2xl font-bold">{detail.name}</h1>
        {tierLabel && <p className="shrink-0 text-sm font-semibold text-accent">{tierLabel}</p>}
      </div>
      <p className="mt-1 text-sm text-muted tabular-nums">
        {formatWorkoutDate(detail.startedAt)} ·{' '}
        {formatDuration((detail.endedAt ?? detail.startedAt) - detail.startedAt)} ·{' '}
        {formatKg(totalVolume)} kg · {setCount} sets
      </p>

      <div className="mt-5 flex flex-col gap-4">
        {detail.exercises.map((entry) => (
          <section
            key={entry.workoutExerciseId}
            className="rounded-2xl glass-tile p-3"
          >
            <p className="font-semibold">
              {entry.exercise.name}
              {prSet.has(entry.exercise._id) && ' 🏆'}
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs tracking-wide text-muted uppercase">
                  <th className="w-12 py-1 font-semibold">Set</th>
                  <th className="py-1 font-semibold">kg</th>
                  <th className="py-1 font-semibold">Reps</th>
                </tr>
              </thead>
              <tbody>
                {entry.sets.map((set) => (
                  <tr key={set._id}>
                    <td className={`py-1 ${set.isWarmup ? 'text-pr' : 'text-muted'}`}>
                      {set.isWarmup ? 'W' : set.setNumber}
                    </td>
                    <td className="py-1 tabular-nums">{formatKg(set.weightKg)}</td>
                    <td className="py-1 tabular-nums">{set.reps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <Link
        to={`/friends/${userId}/${detail._id}/trophy`}
        className="btn-glow mt-6 block w-full rounded-xl bg-accent py-3 text-center font-semibold text-accent-fg"
      >
        Download Trophy
      </Link>
    </div>
  )
}

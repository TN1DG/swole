import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { ExerciseDetail } from '../exercises/ExerciseDetail'

export function WorkoutDetailPage() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const deleteWorkout = useMutation(api.history.deleteWorkout)

  const detail = useQuery(api.history.getDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const prs = useQuery(api.prs.listMine)
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )
  const [selected, setSelected] = useState<Doc<'exercises'> | null>(null)

  if (detail === undefined)
    return <p className="mt-8 text-center text-muted">Loading…</p>
  if (detail === null)
    return (
      <div className="mt-8 text-center text-muted">
        <p>Workout not found.</p>
        <Link to="/history" className="text-accent underline">
          Back to history
        </Link>
      </div>
    )

  const totalVolume = detail.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = detail.exercises.reduce((n, e) => n + e.sets.length, 0)
  const prSet = new Set(detail.prExerciseIds)

  async function handleDelete() {
    if (!window.confirm('Delete this workout? Records will be recalculated.')) return
    await deleteWorkout({ workoutId: detail!._id })
    navigate('/history')
  }

  return (
    <div>
      <Link to="/history" className="text-sm text-muted">
        ← History
      </Link>

      <h1 className="mt-2 text-2xl font-bold">{detail.name}</h1>
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
            <button
              type="button"
              onClick={() => setSelected(entry.exercise)}
              className="font-semibold text-accent underline-offset-4 hover:underline"
            >
              {entry.exercise.name}
              {prSet.has(entry.exercise._id) && ' 🏆'}
            </button>
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
        to={`/share/${detail._id}`}
        className="btn-glow mt-6 block w-full rounded-xl bg-accent py-3 text-center font-semibold text-accent-fg"
      >
        Share as Photo
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        className="mt-3 w-full rounded-xl border border-border py-3 font-semibold text-red-400"
      >
        Delete Workout
      </button>

      {selected && (
        <ExerciseDetail
          exercise={selected}
          record={recordByExercise.get(selected._id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

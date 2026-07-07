import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { beatsRecord, formatDuration, formatKg } from '../../../convex/fitness'
import { ExercisePicker } from './ExercisePicker'

// The exact shape getActive returns, minus null — TypeScript derives it
// from the backend function, so the two can never drift apart.
export type ActiveWorkoutData = NonNullable<
  FunctionReturnType<typeof api.workouts.getActive>
>
export type FinishSummary = FunctionReturnType<typeof api.workouts.finish>

type Props = {
  workout: ActiveWorkoutData
  onFinished: (summary: FinishSummary) => void
}

export function ActiveWorkout({ workout, onFinished }: Props) {
  const addExercise = useMutation(api.workouts.addExercise)
  const finish = useMutation(api.workouts.finish)
  const cancel = useMutation(api.workouts.cancel)

  const prs = useQuery(api.prs.listMine)
  // exerciseId -> record, for O(1) lookups in set rows.
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )

  const [pickerOpen, setPickerOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  // Set whenever any save fails (bad connection, etc.) so nothing is lost silently.
  const [saveError, setSaveError] = useState(false)
  const reportSaveError = () => setSaveError(true)

  // Live stats shown at the top.
  const allSets = workout.exercises.flatMap((e) => e.sets)
  const doneSets = allSets.filter((s) => s.completed)
  const volume = doneSets
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)

  async function handleFinish() {
    const pending = allSets.length - doneSets.length
    if (doneSets.length === 0) {
      if (!window.confirm('No sets are marked done — discard this workout?')) return
    } else if (pending > 0) {
      if (!window.confirm(`${pending} unfinished set${pending > 1 ? 's' : ''} will be discarded. Finish anyway?`)) return
    }
    setFinishing(true)
    try {
      onFinished(await finish({ workoutId: workout._id }))
    } catch {
      reportSaveError()
    } finally {
      setFinishing(false)
    }
  }

  async function handleCancel() {
    if (window.confirm('Discard this entire workout?')) {
      await cancel({ workoutId: workout._id }).catch(reportSaveError)
    }
  }

  return (
    <div>
      {/* Connection problem banner */}
      {saveError && (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          <span>Couldn't save — check your connection and retry.</span>
          <button
            type="button"
            onClick={() => setSaveError(false)}
            className="px-2 font-bold"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* Header: name + live stats, finish/cancel */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{workout.name}</h1>
          <p className="mt-1 text-sm text-muted">
            <ElapsedTimer since={workout.startedAt} /> ·{' '}
            {formatKg(volume)} kg · {doneSets.length} sets
          </p>
        </div>
        <button
          type="button"
          onClick={handleFinish}
          disabled={finishing}
          className="rounded-xl bg-success px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          Finish
        </button>
      </div>

      {/* Exercise cards */}
      <div className="mt-5 flex flex-col gap-4">
        {workout.exercises.map((entry) => (
          <ExerciseCard
            key={entry.workoutExerciseId}
            entry={entry}
            record={recordByExercise.get(entry.exercise._id)}
            onSaveError={reportSaveError}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mt-5 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
      >
        + Add Exercise
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="mt-3 w-full rounded-xl border border-border py-3 font-semibold text-red-400"
      >
        Discard Workout
      </button>

      {pickerOpen && (
        <ExercisePicker
          onClose={() => setPickerOpen(false)}
          onPick={async (exerciseId) => {
            setPickerOpen(false)
            await addExercise({ workoutId: workout._id, exerciseId }).catch(
              reportSaveError,
            )
          }}
        />
      )}
    </div>
  )
}

function ElapsedTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span>{formatDuration(now - since)}</span>
}

// ---------- one exercise with its set rows ----------

function ExerciseCard({
  entry,
  record,
  onSaveError,
}: {
  entry: ActiveWorkoutData['exercises'][number]
  record: { bestWeightKg: number; bestEst1rm: number } | undefined
  onSaveError: () => void
}) {
  const addSet = useMutation(api.workouts.addSet)
  const removeExercise = useMutation(api.workouts.removeExercise)

  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-accent">{entry.exercise.name}</h2>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${entry.exercise.name}?`)) {
              removeExercise({
                workoutExerciseId: entry.workoutExerciseId,
              }).catch(onSaveError)
            }
          }}
          className="px-2 text-muted"
          aria-label="Remove exercise"
        >
          ✕
        </button>
      </div>

      {/* Column headers */}
      <div className="mt-2 grid grid-cols-[2.5rem_1fr_1fr_2.75rem_2rem] items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <span className="text-center">Set</span>
        <span className="text-center">kg</span>
        <span className="text-center">Reps</span>
        <span className="text-center">✓</span>
        <span />
      </div>

      <div className="mt-1 flex flex-col gap-1">
        {entry.sets.map((set) => (
          <SetRow key={set._id} set={set} record={record} onSaveError={onSaveError} />
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          addSet({ workoutExerciseId: entry.workoutExerciseId }).catch(onSaveError)
        }
        className="mt-2 w-full rounded-lg bg-surface-2 py-2 text-sm font-medium text-muted"
      >
        + Add Set
      </button>
    </section>
  )
}

// ---------- one set row ----------

function SetRow({
  set,
  record,
  onSaveError,
}: {
  set: Doc<'sets'>
  record: { bestWeightKg: number; bestEst1rm: number } | undefined
  onSaveError: () => void
}) {
  const updateSet = useMutation(api.workouts.updateSet)
  const removeSet = useMutation(api.workouts.removeSet)

  // Inputs are local state while typing; committed to the server on blur /
  // when the set is checked off. Empty string instead of "0" placeholder.
  const [weight, setWeight] = useState(set.weightKg > 0 ? String(set.weightKg) : '')
  const [reps, setReps] = useState(set.reps > 0 ? String(set.reps) : '')

  const parsedWeight = parseFloat(weight) || 0
  const parsedReps = parseInt(reps, 10) || 0

  // A completed working set that beats (or sets) the record gets a trophy.
  const isPr =
    set.completed && !set.isWarmup && beatsRecord(set.weightKg, set.reps, record)

  function commit(extra?: { completed?: boolean }) {
    updateSet({
      setId: set._id,
      weightKg: parsedWeight,
      reps: parsedReps,
      ...extra,
    }).catch(onSaveError)
  }

  return (
    <div
      className={`grid grid-cols-[2.5rem_1fr_1fr_2.75rem_2rem] items-center gap-2 rounded-lg px-0 py-0.5 ${
        set.completed ? 'bg-success/10' : ''
      }`}
    >
      {/* Set number badge; tap to toggle warm-up */}
      <button
        type="button"
        onClick={() =>
          updateSet({ setId: set._id, isWarmup: !set.isWarmup }).catch(onSaveError)
        }
        className={`justify-self-center rounded-md px-2 py-1 text-sm font-semibold ${
          set.isWarmup ? 'text-pr' : 'text-muted'
        }`}
        title="Tap to toggle warm-up"
      >
        {set.isWarmup ? 'W' : set.setNumber}
        {isPr && ' 🏆'}
      </button>

      <input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => commit()}
        onFocus={(e) => e.target.select()}
        inputMode="decimal"
        placeholder="0"
        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-center outline-none focus:border-accent"
      />
      <input
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => commit()}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        placeholder="0"
        className="w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-center outline-none focus:border-accent"
      />

      {/* Done toggle — also commits current weight/reps */}
      <button
        type="button"
        onClick={() => commit({ completed: !set.completed })}
        className={`justify-self-center rounded-lg px-3 py-1.5 font-bold ${
          set.completed
            ? 'bg-success text-black'
            : 'border border-border text-muted'
        }`}
        aria-label={set.completed ? 'Mark not done' : 'Mark done'}
      >
        ✓
      </button>

      <button
        type="button"
        onClick={() => removeSet({ setId: set._id }).catch(onSaveError)}
        className="justify-self-center text-muted"
        aria-label="Remove set"
      >
        ✕
      </button>
    </div>
  )
}

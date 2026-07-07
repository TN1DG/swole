import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ExercisePicker } from '../workouts/ExercisePicker'

export type RoutineDraft = {
  _id?: Id<'routines'>
  name: string
  exercises: { exerciseId: Id<'exercises'>; name: string; targetSets: number }[]
}

type Props = {
  initial: RoutineDraft | null // null = creating a new routine
  onClose: () => void
}

export function RoutineEditor({ initial, onClose }: Props) {
  const create = useMutation(api.routines.create)
  const update = useMutation(api.routines.update)
  const remove = useMutation(api.routines.remove)

  const [name, setName] = useState(initial?.name ?? '')
  const [exercises, setExercises] = useState(initial?.exercises ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= exercises.length) return
    const next = [...exercises]
    ;[next[index], next[target]] = [next[target], next[index]]
    setExercises(next)
  }

  function setTargetSets(index: number, delta: number) {
    setExercises((list) =>
      list.map((entry, i) =>
        i === index
          ? { ...entry, targetSets: Math.min(10, Math.max(1, entry.targetSets + delta)) }
          : entry,
      ),
    )
  }

  async function handleSave() {
    setError(null)
    const payload = {
      name,
      exercises: exercises.map(({ exerciseId, targetSets }) => ({ exerciseId, targetSets })),
    }
    try {
      if (initial?._id) {
        await update({ routineId: initial._id, ...payload })
      } else {
        await create(payload)
      }
      onClose()
    } catch {
      setError('Could not save — give it a name and at least one exercise.')
    }
  }

  async function handleDelete() {
    if (!initial?._id) return
    if (!window.confirm(`Delete routine "${initial.name}"?`)) return
    await remove({ routineId: initial._id })
    onClose()
  }

  return (
    <div>
      <button type="button" onClick={onClose} className="text-sm text-muted">
        ← Routines
      </button>

      <h1 className="mt-2 text-2xl font-bold">
        {initial?._id ? 'Edit Routine' : 'New Routine'}
      </h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Routine name (e.g. Push Day)"
        className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
      />

      <div className="mt-4 flex flex-col gap-2">
        {exercises.map((entry, i) => (
          <div
            key={`${entry.exerciseId}-${i}`}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
          >
            {/* reorder */}
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted" aria-label="Move up">▲</button>
              <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted" aria-label="Move down">▼</button>
            </div>

            <p className="flex-1 font-medium">{entry.name}</p>

            {/* target sets stepper */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTargetSets(i, -1)}
                className="h-8 w-8 rounded-lg border border-border text-muted"
              >
                −
              </button>
              <span className="w-12 text-center text-sm">
                {entry.targetSets} set{entry.targetSets > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setTargetSets(i, 1)}
                className="h-8 w-8 rounded-lg border border-border text-muted"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setExercises((list) => list.filter((_, j) => j !== i))}
              className="px-1 text-muted"
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mt-3 w-full rounded-xl border border-dashed border-border py-3 font-medium text-muted"
      >
        + Add Exercise
      </button>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        className="mt-4 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
      >
        Save Routine
      </button>

      {initial?._id && (
        <button
          type="button"
          onClick={handleDelete}
          className="mt-3 w-full rounded-xl border border-border py-3 font-semibold text-red-400"
        >
          Delete Routine
        </button>
      )}

      {pickerOpen && (
        <ExercisePickerWithNames
          onClose={() => setPickerOpen(false)}
          onPickNamed={(exerciseId, exerciseName) => {
            setExercises((list) => [
              ...list,
              { exerciseId, name: exerciseName, targetSets: 3 },
            ])
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

// Thin wrapper: the shared picker returns an id; the editor also needs the
// name for display before anything is saved.
import { useQuery } from 'convex/react'

function ExercisePickerWithNames({
  onPickNamed,
  onClose,
}: {
  onPickNamed: (id: Id<'exercises'>, name: string) => void
  onClose: () => void
}) {
  const all = useQuery(api.exercises.list)
  return (
    <ExercisePicker
      onClose={onClose}
      onPick={(id) => {
        const match = (all ?? []).find((ex) => ex._id === id)
        onPickNamed(id, match?.name ?? '?')
      }}
    />
  )
}

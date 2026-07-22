import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from '../../../convex/constants'

type Props = {
  /** When set, the form edits this exercise instead of creating a new one. */
  initial?: Doc<'exercises'> | null
  onClose: () => void
}

// Bottom-sheet form for creating/editing a custom exercise.
export function ExerciseForm({ initial, onClose }: Props) {
  const create = useMutation(api.exercises.create)
  const update = useMutation(api.exercises.update)

  const [name, setName] = useState(initial?.name ?? '')
  const [muscleGroup, setMuscleGroup] = useState(initial?.muscleGroup ?? 'Chest')
  const [equipment, setEquipment] = useState(initial?.equipment ?? 'Barbell')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (initial) {
        await update({ id: initial._id, name, muscleGroup, equipment })
      } else {
        await create({ name, muscleGroup, equipment })
      }
      onClose()
    } catch {
      setError('Could not save. Check the name and try again.')
    }
  }

  return (
    // Dark backdrop; clicking it closes the sheet.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      {/* stopPropagation so clicks inside the sheet don't close it */}
      <div
        className="w-full max-w-lg rounded-t-2xl glass-card border-b-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">
          {initial ? 'Edit Exercise' : 'New Exercise'}
        </h2>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Exercise name"
            className="rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
          />

          <label className="text-sm text-muted">
            Muscle group
            <select
              value={muscleGroup}
              onChange={(e) => setMuscleGroup(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-text outline-none focus:border-accent"
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted">
            Equipment
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-text outline-none focus:border-accent"
            >
              {EQUIPMENT_TYPES.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-3 font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-glow flex-1 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

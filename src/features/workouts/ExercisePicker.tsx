import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

type Props = {
  onPick: (exerciseId: Id<'exercises'>) => void
  onClose: () => void
}

// Bottom sheet with a searchable exercise list; tap one to add it.
export function ExercisePicker({ onPick, onClose }: Props) {
  const exercises = useQuery(api.exercises.list)
  const [search, setSearch] = useState('')

  const filtered = (exercises ?? []).filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex h-[75svh] w-full max-w-lg flex-col rounded-t-2xl glass-card border-b-0 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Add Exercise</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          autoFocus
          className="mt-3 rounded-xl border border-border bg-surface-2 px-4 py-3 outline-none focus:border-accent"
        />
        <ul className="no-scrollbar mt-3 flex-1 overflow-y-auto">
          {filtered.map((ex) => (
            <li key={ex._id}>
              <button
                type="button"
                onClick={() => onPick(ex._id)}
                className="w-full border-b border-border px-1 py-3 text-left"
              >
                <p className="font-medium">{ex.name}</p>
                <p className="text-sm text-muted">
                  {ex.muscleGroup} · {ex.equipment}
                </p>
              </button>
            </li>
          ))}
          {exercises !== undefined && filtered.length === 0 && (
            <p className="mt-6 text-center text-muted">
              No match. Add custom exercises in the Exercises tab.
            </p>
          )}
        </ul>
      </div>
    </div>
  )
}

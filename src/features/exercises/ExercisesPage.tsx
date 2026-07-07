import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { MUSCLE_GROUPS } from '../../../convex/constants'
import { ExerciseDetail } from './ExerciseDetail'
import { ExerciseForm } from './ExerciseForm'

export function ExercisesPage() {
  // Reactive: re-renders automatically whenever exercises change on the server.
  const exercises = useQuery(api.exercises.list)

  const prs = useQuery(api.prs.listMine)
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<Doc<'exercises'> | null>(null)

  const filtered = (exercises ?? []).filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    const matchesGroup = groupFilter === null || ex.muscleGroup === groupFilter
    return matchesSearch && matchesGroup
  })

  // Group into sections, in our fixed muscle-group order.
  const sections = MUSCLE_GROUPS.map((group) => ({
    group,
    items: filtered.filter((ex) => ex.muscleGroup === group),
  })).filter((s) => s.items.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
        >
          + New
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises…"
        className="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
      />

      {/* Muscle group filter chips */}
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip
          label="All"
          active={groupFilter === null}
          onClick={() => setGroupFilter(null)}
        />
        {MUSCLE_GROUPS.map((g) => (
          <FilterChip
            key={g}
            label={g}
            active={groupFilter === g}
            onClick={() => setGroupFilter(groupFilter === g ? null : g)}
          />
        ))}
      </div>

      {/* List */}
      {exercises === undefined ? (
        <p className="mt-8 text-center text-muted">Loading…</p>
      ) : sections.length === 0 ? (
        <p className="mt-8 text-center text-muted">No exercises found.</p>
      ) : (
        sections.map(({ group, items }) => (
          <section key={group} className="mt-5">
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
              {group}
            </h2>
            <ul className="mt-2 flex flex-col gap-2">
              {items.map((ex) => (
                <li key={ex._id}>
                  <button
                    type="button"
                    // Opens the detail sheet: chart, PRs, recent sessions.
                    onClick={() => setSelected(ex)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium">{ex.name}</p>
                      <p className="text-sm text-muted">
                        {ex.equipment}
                        {recordByExercise.has(ex._id) &&
                          ` · 🏆 ${recordByExercise.get(ex._id)!.bestWeightKg} kg`}
                      </p>
                    </div>
                    {ex.isCustom && (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                        Custom
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {formOpen && <ExerciseForm onClose={() => setFormOpen(false)} />}

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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
        active
          ? 'bg-accent text-accent-fg'
          : 'border border-border bg-surface text-muted'
      }`}
    >
      {label}
    </button>
  )
}

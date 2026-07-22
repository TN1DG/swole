import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { ClipboardIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { RoutineEditor, type RoutineDraft } from './RoutineEditor'

export function RoutinesPage() {
  const routines = useQuery(api.routines.list)
  const startFromRoutine = useMutation(api.routines.startFromRoutine)
  const navigate = useNavigate()

  // null = list view; otherwise the editor is open ('new' or an existing draft).
  const [editing, setEditing] = useState<RoutineDraft | 'new' | null>(null)

  if (editing !== null) {
    return (
      <RoutineEditor
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    )
  }

  async function handleStart(routineId: (typeof routines & object)[number]['_id']) {
    try {
      await startFromRoutine({ routineId })
      navigate('/') // jump to the Workout tab, which now shows the active session
    } catch {
      window.alert('Finish your current workout first.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Routines</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg"
        >
          + New
        </button>
      </div>
      <FirstVisitTip tabKey="routines" />

      {routines === undefined ? (
        <p className="mt-8 text-center text-muted">Loading…</p>
      ) : routines.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-center text-muted">
          <ClipboardIcon className="h-8 w-8" />
          <p>No routines yet. Build one and start workouts with two taps.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {routines.map((routine) => (
            <div
              key={routine._id}
              className="rounded-2xl glass-tile p-4"
            >
              <p className="font-semibold">{routine.name}</p>
              <p className="mt-1 text-sm text-muted">
                {routine.exercises
                  .map((ex) => `${ex.targetSets}×${ex.name}`)
                  .join(' · ')}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleStart(routine._id)}
                  className="btn-glow flex-1 rounded-xl bg-accent py-2 font-semibold text-accent-fg"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(routine)}
                  className="flex-1 rounded-xl border border-border py-2 font-semibold text-muted"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

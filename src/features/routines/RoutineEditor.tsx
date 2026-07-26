import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ExercisePicker } from '../workouts/ExercisePicker'
import { GlassTile } from '../../components/GlassTile'
import { ConfirmDialog } from '../../components/ConfirmDialog'

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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

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
    await remove({ routineId: initial._id })
    onClose()
  }

  return (
    <Box>
      <Typography
        component="button"
        type="button"
        onClick={onClose}
        variant="body2"
        color="text.secondary"
        sx={{ border: 'none', bgcolor: 'transparent', p: 0, cursor: 'pointer', font: 'inherit' }}
      >
        ← Routines
      </Typography>

      <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
        {initial?._id ? 'Edit Routine' : 'New Routine'}
      </Typography>

      <TextField
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Routine name (e.g. Push Day)"
        fullWidth
        sx={{ mt: 2 }}
      />

      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {exercises.map((entry, i) => (
          <GlassTile key={`${entry.exerciseId}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
            {/* reorder */}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <IconButton size="small" onClick={() => move(i, -1)} aria-label="Move up" sx={{ color: 'text.secondary', py: 0.25 }}>
                ▲
              </IconButton>
              <IconButton size="small" onClick={() => move(i, 1)} aria-label="Move down" sx={{ color: 'text.secondary', py: 0.25 }}>
                ▼
              </IconButton>
            </Box>

            <Typography sx={{ flex: 1, fontWeight: 500 }}>{entry.name}</Typography>

            {/* target sets stepper */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton
                size="small"
                onClick={() => setTargetSets(i, -1)}
                sx={{ height: 32, width: 32, borderRadius: '8px', border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}
              >
                −
              </IconButton>
              <Typography variant="body2" sx={{ width: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {entry.targetSets} set{entry.targetSets > 1 ? 's' : ''}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setTargetSets(i, 1)}
                sx={{ height: 32, width: 32, borderRadius: '8px', border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}
              >
                +
              </IconButton>
            </Box>

            <IconButton
              size="small"
              aria-label="Remove"
              sx={{ color: 'text.secondary' }}
              onClick={() => setExercises((list) => list.filter((_, j) => j !== i))}
            >
              ✕
            </IconButton>
          </GlassTile>
        ))}
      </Box>

      <Button
        variant="outlined"
        color="inherit"
        fullWidth
        sx={{ mt: 1.5, borderStyle: 'dashed', color: 'text.secondary' }}
        onClick={() => setPickerOpen(true)}
      >
        + Add Exercise
      </Button>

      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 1.5 }}>
          {error}
        </Typography>
      )}

      <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={() => void handleSave()}>
        Save Routine
      </Button>

      {initial?._id && (
        <Button
          variant="outlined"
          color="inherit"
          fullWidth
          sx={{ mt: 1.5, color: 'error.main' }}
          onClick={() => setConfirmDeleteOpen(true)}
        >
          Delete Routine
        </Button>
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

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={`Delete routine "${initial?.name}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </Box>
  )
}

// Thin wrapper: the shared picker returns an id; the editor also needs the
// name for display before anything is saved.

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

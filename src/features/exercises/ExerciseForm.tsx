import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Box, Button, MenuItem, Select, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { EQUIPMENT_TYPES, MUSCLE_GROUPS } from '../../../convex/constants'
import { BottomSheet } from '../../components/BottomSheet'

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
    <BottomSheet open onClose={() => onClose()} paperSx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        {initial ? 'Edit Exercise' : 'New Exercise'}
      </Typography>

      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Exercise name"
          fullWidth
        />

        <Box>
          <Typography variant="body2" color="text.secondary">
            Muscle group
          </Typography>
          <Select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            fullWidth
            sx={{ mt: 0.5 }}
            inputProps={{ 'aria-label': 'Muscle group' }}
          >
            {MUSCLE_GROUPS.map((g) => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary">
            Equipment
          </Typography>
          <Select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            fullWidth
            sx={{ mt: 0.5 }}
            inputProps={{ 'aria-label': 'Equipment' }}
          >
            {EQUIPMENT_TYPES.map((eq) => (
              <MenuItem key={eq} value={eq}>
                {eq}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        <Box sx={{ mt: 1, display: 'flex', gap: 1.5 }}>
          <Button type="button" variant="outlined" color="inherit" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" fullWidth>
            Save
          </Button>
        </Box>
      </Box>
    </BottomSheet>
  )
}

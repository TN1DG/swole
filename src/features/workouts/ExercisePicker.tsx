import { useState } from 'react'
import { useQuery } from 'convex/react'
import { List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { BottomSheet } from '../../components/BottomSheet'
import { noScrollbarSx } from '../../theme/noScrollbar'

type Props = {
  onPick: (exerciseId: Id<'exercises'>) => void
  onClose: () => void
}

// Bottom sheet with a searchable exercise list; tap one to add it. Reused
// unmodified by RoutineEditor (via a small wrapper) and ActiveWorkout.
export function ExercisePicker({ onPick, onClose }: Props) {
  const exercises = useQuery(api.exercises.list)
  const [search, setSearch] = useState('')

  const filtered = (exercises ?? []).filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <BottomSheet
      open
      onClose={() => onClose()}
      paperSx={{ height: '75svh', display: 'flex', flexDirection: 'column', p: 2 }}
    >
      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        Add Exercise
      </Typography>
      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        autoFocus
        fullWidth
        sx={{ mt: 1.5 }}
      />
      <List sx={{ mt: 1.5, flex: 1, overflowY: 'auto', ...noScrollbarSx }} disablePadding>
        {filtered.map((ex) => (
          <ListItemButton
            key={ex._id}
            onClick={() => onPick(ex._id)}
            sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 0.5, py: 1.5 }}
          >
            <ListItemText primary={ex.name} secondary={`${ex.muscleGroup} · ${ex.equipment}`} />
          </ListItemButton>
        ))}
        {exercises !== undefined && filtered.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
            No match. Add custom exercises in the Exercises tab.
          </Typography>
        )}
      </List>
    </BottomSheet>
  )
}

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { BottomSheet } from '../../components/BottomSheet'
import { noScrollbarSx } from '../../theme/noScrollbar'

export type PickedFood = {
  description: string
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
}

type Props = {
  onPick: (food: PickedFood) => void
  onClose: () => void
}

// Bottom sheet with a searchable list of the seeded food database (see
// convex/foods.ts + foodSeedData.ts) — same "fetch the small reference list,
// filter client-side" shape as ExercisePicker. Picking an item hands its
// macros back to CaloricConsistencyPage, which fills the manual-entry
// fields, so it's a free (no vision-model call) alternative to the photo
// path for anything common enough to already be in the dataset.
export function FoodPicker({ onPick, onClose }: Props) {
  const foods = useQuery(api.foods.list)
  const [search, setSearch] = useState('')

  const filtered = (foods ?? []).filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <BottomSheet
      open
      onClose={() => onClose()}
      paperSx={{ height: '75svh', display: 'flex', flexDirection: 'column', p: 2 }}
    >
      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        Search Food
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
        {filtered.map((f) => (
          <ListItemButton
            key={f._id}
            onClick={() =>
              onPick({
                description: f.name,
                calories: f.calories,
                proteinG: f.proteinG,
                carbsG: f.carbsG,
                fatG: f.fatG,
                fiberG: f.fiberG,
              })
            }
            sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 0.5, py: 1.5 }}
          >
            <ListItemText
              primary={f.name}
              secondary={`${f.calories} kcal · P ${f.proteinG}g · C ${f.carbsG}g · F ${f.fatG}g`}
            />
          </ListItemButton>
        ))}
        {foods !== undefined && filtered.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
            No match. Log it manually instead.
          </Typography>
        )}
      </List>
    </BottomSheet>
  )
}

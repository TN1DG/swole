import { useState, type ReactNode } from 'react'
import { List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material'
import { BottomSheet } from './BottomSheet'
import { noScrollbarSx } from '../theme/noScrollbar'

type Props<T> = {
  title: string
  items: T[] | undefined
  getKey: (item: T) => string
  matchesSearch: (item: T, search: string) => boolean
  primary: (item: T) => ReactNode
  secondary: (item: T) => ReactNode
  emptyMessage: string
  onPick: (item: T) => void
  onClose: () => void
}

// A bottom sheet with a client-side-filtered search list; tap a row to pick
// it. Extracted from ExercisePicker and FoodPicker, which had grown into the
// same component with different data behind it — same reasoning BottomSheet
// itself was pulled out for (see that file's comment).
export function SearchPickerSheet<T>({
  title,
  items,
  getKey,
  matchesSearch,
  primary,
  secondary,
  emptyMessage,
  onPick,
  onClose,
}: Props<T>) {
  const [search, setSearch] = useState('')

  const filtered = (items ?? []).filter((item) => matchesSearch(item, search))

  return (
    <BottomSheet
      open
      onClose={() => onClose()}
      paperSx={{ height: '75svh', display: 'flex', flexDirection: 'column', p: 2 }}
    >
      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        {title}
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
        {filtered.map((item) => (
          <ListItemButton
            key={getKey(item)}
            onClick={() => onPick(item)}
            sx={{ borderBottom: '1px solid', borderColor: 'divider', px: 0.5, py: 1.5 }}
          >
            <ListItemText primary={primary(item)} secondary={secondary(item)} />
          </ListItemButton>
        ))}
        {items !== undefined && filtered.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
            {emptyMessage}
          </Typography>
        )}
      </List>
    </BottomSheet>
  )
}

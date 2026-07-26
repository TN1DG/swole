import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Chip, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { MUSCLE_GROUPS } from '../../../convex/constants'
import { BarbellIcon, HeartOutlineIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { ExerciseDetail } from './ExerciseDetail'
import { ExerciseForm } from './ExerciseForm'
import { GlassTile } from '../../components/GlassTile'
import { noScrollbarSx } from '../../theme/noScrollbar'

export function ExercisesPage() {
  // Reactive: re-renders automatically whenever exercises change on the server.
  const exercises = useQuery(api.exercises.list)

  const prs = useQuery(api.prs.listMine)
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )

  const favoriteIds = useQuery(api.favorites.myFavoriteIds)
  const favoriteIdSet = useMemo(() => new Set(favoriteIds ?? []), [favoriteIds])
  const toggleFavorite = useMutation(api.favorites.toggle)

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<Doc<'exercises'> | null>(null)

  const filtered = (exercises ?? []).filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    const matchesGroup = groupFilter === null || ex.muscleGroup === groupFilter
    const matchesFavorite = !favoritesOnly || favoriteIdSet.has(ex._id)
    return matchesSearch && matchesGroup && matchesFavorite
  })

  // Group into sections, in our fixed muscle-group order.
  const sections = MUSCLE_GROUPS.map((group) => ({
    group,
    items: filtered.filter((ex) => ex.muscleGroup === group),
  })).filter((s) => s.items.length > 0)

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Exercises
        </Typography>
        <Button variant="contained" size="small" onClick={() => setFormOpen(true)}>
          + New
        </Button>
      </Box>
      <FirstVisitTip tabKey={favoritesOnly ? 'favorites' : 'exercises'} />

      {/* Search */}
      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises…"
        fullWidth
        sx={{ mt: 2 }}
      />

      {/* Muscle group + favorites filter chips */}
      <Box
        sx={{ mt: 1.5, mx: -2, px: 2, display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, ...noScrollbarSx }}
      >
        <Chip
          label="All"
          clickable
          onClick={() => setGroupFilter(null)}
          color={groupFilter === null ? 'primary' : undefined}
          sx={groupFilter === null ? undefined : { bgcolor: 'surface2.main', color: 'text.secondary' }}
        />
        <Chip
          label={favoritesOnly ? '❤️ Favorites' : '🤍 Favorites'}
          clickable
          onClick={() => setFavoritesOnly((v) => !v)}
          color={favoritesOnly ? 'primary' : undefined}
          sx={favoritesOnly ? undefined : { bgcolor: 'surface2.main', color: 'text.secondary' }}
        />
        {MUSCLE_GROUPS.map((g) => (
          <Chip
            key={g}
            label={g}
            clickable
            onClick={() => setGroupFilter(groupFilter === g ? null : g)}
            color={groupFilter === g ? 'primary' : undefined}
            sx={groupFilter === g ? undefined : { bgcolor: 'surface2.main', color: 'text.secondary' }}
          />
        ))}
      </Box>

      {/* List */}
      {exercises === undefined ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : sections.length === 0 ? (
        <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
          {favoritesOnly ? (
            <>
              <HeartOutlineIcon size={32} />
              <Typography color="text.secondary">
                No favorites yet — tap the heart on an exercise to pin it here.
              </Typography>
            </>
          ) : (
            <>
              <BarbellIcon size={32} />
              <Typography color="text.secondary">No exercises found.</Typography>
            </>
          )}
        </Box>
      ) : (
        sections.map(({ group, items }) => (
          <Box component="section" key={group} sx={{ mt: 2.5 }}>
            <Typography variant="overline" color="text.secondary" component="h2">
              {group}
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {items.map((ex) => (
                <GlassTile key={ex._id} sx={{ position: 'relative' }}>
                  <Box
                    component="button"
                    type="button"
                    // Opens the detail sheet: chart, PRs, recent sessions.
                    onClick={() => setSelected(ex)}
                    sx={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 1.5,
                      pr: 6,
                      pl: 2,
                      textAlign: 'left',
                      border: 'none',
                      bgcolor: 'transparent',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 500 }}>
                        {ex.name}
                      </Typography>
                      <Typography noWrap variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {ex.equipment}
                        {recordByExercise.has(ex._id) &&
                          ` · 🏆 ${recordByExercise.get(ex._id)!.bestWeightKg} kg`}
                      </Typography>
                    </Box>
                    {ex.isCustom && (
                      <Chip
                        label="Custom"
                        size="small"
                        sx={{ flexShrink: 0, bgcolor: 'rgb(193 84 31 / 0.2)', color: 'primary.main' }}
                      />
                    )}
                  </Box>
                  <IconButton
                    aria-label={favoriteIdSet.has(ex._id) ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={() => void toggleFavorite({ exerciseId: ex._id })}
                    sx={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', fontSize: '1.125rem' }}
                  >
                    {favoriteIdSet.has(ex._id) ? '❤️' : '🤍'}
                  </IconButton>
                </GlassTile>
              ))}
            </Box>
          </Box>
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
    </Box>
  )
}

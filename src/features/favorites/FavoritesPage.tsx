import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Box, ButtonBase, IconButton, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatKg } from '../../../convex/fitness'
import { HeartOutlineIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { ExerciseDetail } from '../exercises/ExerciseDetail'
import { GlassTile } from '../../components/GlassTile'

export function FavoritesPage() {
  const favorites = useQuery(api.favorites.listMine)
  const toggleFavorite = useMutation(api.favorites.toggle)
  const [selected, setSelected] = useState<NonNullable<typeof favorites>[number] | null>(
    null,
  )

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Favorites
      </Typography>
      <FirstVisitTip tabKey="favorites" />

      {favorites === undefined ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : favorites.length === 0 ? (
        <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
          <HeartOutlineIcon size={32} />
          <Typography color="text.secondary">No favorites yet — tap the heart on an exercise to pin it here.</Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {favorites.map((fav) => (
            <GlassTile key={fav.exercise._id} sx={{ position: 'relative' }}>
              <ButtonBase
                // Same detail sheet as the Exercises tab: one place for stats.
                onClick={() => setSelected(fav)}
                sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', py: 1.5, pr: 6, pl: 2 }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 500 }}>{fav.exercise.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fav.exercise.equipment ?? fav.exercise.muscleGroup}
                    {fav.record &&
                      ` · 🏆 ${formatKg(fav.record.bestWeightKg)} kg × ${fav.record.bestWeightReps}`}
                  </Typography>
                </Box>
              </ButtonBase>
              <IconButton
                aria-label="Remove from favorites"
                onClick={() => void toggleFavorite({ exerciseId: fav.exercise._id })}
                sx={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', fontSize: '1.125rem' }}
              >
                ❤️
              </IconButton>
            </GlassTile>
          ))}
        </Box>
      )}

      {selected && (
        <ExerciseDetail
          exercise={selected.exercise}
          record={selected.record}
          onClose={() => setSelected(null)}
        />
      )}
    </Box>
  )
}

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { formatShortDate } from '../../lib/dates'
import { useWeightUnit } from '../../lib/useWeightUnit'
import { BarbellIcon, PlateIcon } from '../../components/icons'
import { ExerciseForm } from './ExerciseForm'
import { ProgressChart } from './ProgressChart'
import { BottomSheet } from '../../components/BottomSheet'
import { GlassTile } from '../../components/GlassTile'
import { noScrollbarSx } from '../../theme/noScrollbar'

type Props = {
  exercise: Doc<'exercises'>
  record?: { bestWeightKg: number; bestWeightReps: number; bestEst1rm: number } | null
  onClose: () => void
}

// Bottom sheet: progress chart + PRs + recent sessions for one exercise.
// This is the one place exercise detail is rendered — every screen that
// wants to show a lift's stats opens this instead of building its own.
export function ExerciseDetail({ exercise, record, onClose }: Props) {
  const history = useQuery(api.history.exerciseHistory, { exerciseId: exercise._id })
  const isFavorited = useQuery(api.favorites.isFavorited, { exerciseId: exercise._id })
  const toggleFavorite = useMutation(api.favorites.toggle)
  const [editOpen, setEditOpen] = useState(false)
  const { unit, toDisplay, formatWeightWithUnit } = useWeightUnit()

  // The chart plots display units too — leaving its axis in kg under tiles
  // that read "lb" would be worse than not converting at all.
  const points = (history ?? []).slice(-30).map((s) => ({
    label: formatShortDate(s.startedAt),
    value: toDisplay(s.topWeightKg),
  }))
  // "Compounded lift": total weight ever moved on this exercise, across every session.
  const lifetimeVolumeKg = (history ?? []).reduce((sum, s) => sum + s.volumeKg, 0)

  return (
    <BottomSheet
      open
      onClose={() => onClose()}
      paperSx={{ maxHeight: '85svh', display: 'flex', flexDirection: 'column', p: 2, overflowY: 'auto', ...noScrollbarSx }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {exercise.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {exercise.muscleGroup} · {exercise.equipment}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <IconButton
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => void toggleFavorite({ exerciseId: exercise._id })}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px', fontSize: '1.125rem' }}
          >
            {isFavorited ? '❤️' : '🤍'}
          </IconButton>
          {exercise.isCustom && (
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={() => setEditOpen(true)}
              sx={{ color: 'text.secondary' }}
            >
              Edit
            </Button>
          )}
        </Box>
      </Box>

      {/* PR stats */}
      {record && (
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          <GlassTile sx={{ p: 1.5 }}>
            <Typography variant="overline" color="text.secondary" component="p">
              Best weight
            </Typography>
            <Typography sx={{ mt: 0.5, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              🏆 {formatWeightWithUnit(record.bestWeightKg)} × {record.bestWeightReps}
            </Typography>
          </GlassTile>
          <GlassTile sx={{ p: 1.5 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              component="p"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <BarbellIcon size={14} /> Est. 1RM
            </Typography>
            <Typography sx={{ mt: 0.5, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              {formatWeightWithUnit(record.bestEst1rm)}
            </Typography>
          </GlassTile>
        </Box>
      )}
      {lifetimeVolumeKg > 0 && (
        <GlassTile sx={{ mt: 1.5, p: 1.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="p"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <PlateIcon size={14} /> Lifetime volume
          </Typography>
          <Typography sx={{ mt: 0.5, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
            {formatWeightWithUnit(lifetimeVolumeKg)}
          </Typography>
        </GlassTile>
      )}

      {/* Progress chart */}
      <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 3 }}>
        Top set per session ({unit})
      </Typography>
      {history === undefined ? (
        <Typography sx={{ mt: 1.5, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : points.length >= 2 ? (
        <GlassTile sx={{ mt: 1, p: 1 }}>
          <ProgressChart points={points} />
        </GlassTile>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Log this exercise in at least two workouts to see a progress chart.
        </Typography>
      )}

      {/* Recent sessions */}
      {history && history.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mt: 3 }}>
            Recent sessions
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[...history]
              .reverse()
              .slice(0, 5)
              .map((s) => (
                <GlassTile
                  key={s.workoutId}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1,
                    fontSize: '0.875rem',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {formatShortDate(s.startedAt)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {formatWeightWithUnit(s.topWeightKg)} × {s.topWeightReps}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {s.setCount} sets · {formatWeightWithUnit(s.volumeKg)}
                  </Typography>
                </GlassTile>
              ))}
          </Box>
        </>
      )}

      {editOpen && <ExerciseForm initial={exercise} onClose={() => setEditOpen(false)} />}
    </BottomSheet>
  )
}

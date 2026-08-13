import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import {
  Box,
  Button,
  ButtonBase,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { behindRecord, formatDuration } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { useWeightUnit } from '../../lib/useWeightUnit'
import { ExerciseDetail } from '../exercises/ExerciseDetail'
import { GlassTile } from '../../components/GlassTile'
import { ConfirmDialog } from '../../components/ConfirmDialog'

export function WorkoutDetailPage() {
  const { workoutId } = useParams()
  const navigate = useNavigate()
  const deleteWorkout = useMutation(api.history.deleteWorkout)

  const detail = useQuery(api.history.getDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  const prs = useQuery(api.prs.listMine)
  const recordByExercise = useMemo(
    () => new Map((prs ?? []).map((r) => [r.exerciseId, r])),
    [prs],
  )
  const [selected, setSelected] = useState<Doc<'exercises'> | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { unit, formatWeight, formatWeightWithUnit } = useWeightUnit()

  if (detail === undefined)
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  if (detail === null)
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Workout not found.</Typography>
        <Typography component={Link} to="/history" color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back to history
        </Typography>
      </Box>
    )

  const totalVolume = detail.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = detail.exercises.reduce((n, e) => n + e.sets.length, 0)
  const prSet = new Set(detail.prExerciseIds)
  // Separate from `recordByExercise` above (which feeds the ExerciseDetail
  // popup and holds every record): these are only the records this workout
  // is actually allowed to be measured against — see history.ts:getDetail.
  const eligibleRecordByExercise = new Map(
    detail.eligibleRecords.map((r) => [r.exerciseId, r]),
  )

  async function handleDelete() {
    await deleteWorkout({ workoutId: detail!._id })
    navigate('/history')
  }

  return (
    <Box>
      <Typography component={Link} to="/history" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← History
      </Typography>

      <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
        {detail.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
        {formatWorkoutDate(detail.startedAt)} ·{' '}
        {formatDuration((detail.endedAt ?? detail.startedAt) - detail.startedAt)} ·{' '}
        {formatWeightWithUnit(totalVolume)} · {setCount} sets
      </Typography>

      <Box sx={{ mt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {detail.exercises.map((entry) => (
          <GlassTile key={entry.workoutExerciseId} sx={{ p: 1.5 }}>
            <ButtonBase
              onClick={() => setSelected(entry.exercise)}
              sx={{ fontWeight: 600, color: 'primary.main' }}
            >
              {entry.exercise.name}
              {prSet.has(entry.exercise._id) && ' 🏆'}
            </ButtonBase>
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  {['Set', unit, 'Reps'].map((label) => (
                    <TableCell
                      key={label}
                      sx={{
                        border: 0,
                        py: 0.5,
                        px: 0,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                        color: 'text.secondary',
                      }}
                    >
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {entry.sets.map((set) => {
                  // Warm-ups never count toward records, so they're never
                  // "conquered" either.
                  const conquered =
                    !set.isWarmup &&
                    behindRecord(
                      set.weightKg,
                      set.reps,
                      eligibleRecordByExercise.get(entry.exercise._id),
                    )
                  const conqueredSx = conquered
                    ? { textDecoration: 'line-through', textDecorationColor: 'var(--color-error)', opacity: 0.55 }
                    : null
                  return (
                    <TableRow key={set._id} title={conquered ? 'Beaten by your PR' : undefined}>
                      <TableCell
                        sx={{
                          border: 0,
                          py: 0.5,
                          px: 0,
                          color: set.isWarmup ? 'pr.main' : 'text.secondary',
                          ...conqueredSx,
                        }}
                      >
                        {set.isWarmup ? 'W' : set.setNumber}
                      </TableCell>
                      <TableCell
                        sx={{ border: 0, py: 0.5, px: 0, fontVariantNumeric: 'tabular-nums', ...conqueredSx }}
                      >
                        {formatWeight(set.weightKg)}
                      </TableCell>
                      <TableCell
                        sx={{ border: 0, py: 0.5, px: 0, fontVariantNumeric: 'tabular-nums', ...conqueredSx }}
                      >
                        {set.reps}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </GlassTile>
        ))}
      </Box>

      <Button component={Link} to={`/feed/compose/${detail._id}`} variant="contained" fullWidth sx={{ mt: 3 }}>
        Share to Feed
      </Button>
      <Button
        component={Link}
        to={`/share/${detail._id}`}
        variant="outlined"
        color="inherit"
        fullWidth
        sx={{ mt: 1.5 }}
      >
        Share as Photo
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        fullWidth
        sx={{ mt: 1.5, color: 'error.main' }}
        onClick={() => setConfirmDeleteOpen(true)}
      >
        Delete Workout
      </Button>

      {selected && (
        <ExerciseDetail
          exercise={selected}
          record={recordByExercise.get(selected._id)}
          onClose={() => setSelected(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete this workout?"
        description="Records will be recalculated."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </Box>
  )
}

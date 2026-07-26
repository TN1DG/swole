import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Button, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { TIER_LABELS } from '../../lib/tierLabels'
import { GlassTile } from '../../components/GlassTile'

// Read-only detail for a friend's (or public opt-in user's) workout — same
// set-by-set breakdown as your own WorkoutDetailPage, minus anything that
// implies ownership (no delete button; "Share" becomes "Download Trophy",
// a stats-only card since the friend has no photo from that session).
// Exercise names aren't clickable here (unlike your own history) — the
// ExerciseDetail sheet queries *your* exercise history/favorites, which
// would show the wrong person's data for someone else's workout.
export function FriendWorkoutDetailPage() {
  const { userId, workoutId } = useParams()
  const detail = useQuery(api.friends.getFriendWorkoutDetail, {
    workoutId: workoutId as Id<'workouts'>,
  })

  if (detail === undefined)
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  if (detail === null)
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Can't view this — you're not friends, and their workouts aren't public.</Typography>
        <Typography component={Link} to={`/friends/${userId}`} color="primary.main" sx={{ textDecoration: 'underline' }}>
          Back
        </Typography>
      </Box>
    )

  const totalVolume = detail.exercises
    .flatMap((e) => e.sets)
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0)
  const setCount = detail.exercises.reduce((n, e) => n + e.sets.length, 0)
  const prSet = new Set(detail.prExerciseIds)
  const tierLabel = TIER_LABELS[detail.consistency.tier]

  return (
    <Box>
      <Typography component={Link} to={`/friends/${userId}`} variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← {detail.owner.displayName}
      </Typography>

      <Box sx={{ mt: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography noWrap variant="h4" sx={{ fontWeight: 'bold' }}>
          {detail.name}
        </Typography>
        {tierLabel && (
          <Typography variant="body2" color="primary.main" sx={{ flexShrink: 0, fontWeight: 600 }}>
            {tierLabel}
          </Typography>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
        {formatWorkoutDate(detail.startedAt)} ·{' '}
        {formatDuration((detail.endedAt ?? detail.startedAt) - detail.startedAt)} · {formatKg(totalVolume)} kg ·{' '}
        {setCount} sets
      </Typography>

      <Box sx={{ mt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {detail.exercises.map((entry) => (
          <GlassTile key={entry.workoutExerciseId} sx={{ p: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {entry.exercise.name}
              {prSet.has(entry.exercise._id) && ' 🏆'}
            </Typography>
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  {['Set', 'kg', 'Reps'].map((label) => (
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
                {entry.sets.map((set) => (
                  <TableRow key={set._id}>
                    <TableCell sx={{ border: 0, py: 0.5, px: 0, color: set.isWarmup ? 'pr.main' : 'text.secondary' }}>
                      {set.isWarmup ? 'W' : set.setNumber}
                    </TableCell>
                    <TableCell sx={{ border: 0, py: 0.5, px: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {formatKg(set.weightKg)}
                    </TableCell>
                    <TableCell sx={{ border: 0, py: 0.5, px: 0, fontVariantNumeric: 'tabular-nums' }}>{set.reps}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </GlassTile>
        ))}
      </Box>

      <Button component={Link} to={`/friends/${userId}/${detail._id}/trophy`} variant="contained" fullWidth sx={{ mt: 3 }}>
        Download Trophy
      </Button>
    </Box>
  )
}

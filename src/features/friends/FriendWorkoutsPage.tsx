import { Link, useParams } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatDuration } from '../../../convex/fitness'
import { formatWorkoutDate } from '../../lib/dates'
import { useWeightUnit } from '../../lib/useWeightUnit'
import { GlassTile } from '../../components/GlassTile'

// Read-only: a friend's (or a public opt-in user's) workout history. Same
// card shape as your own History tab; tapping one opens a read-only detail
// view (FriendWorkoutDetailPage).
export function FriendWorkoutsPage() {
  const { userId } = useParams()
  const data = useQuery(api.friends.friendWorkouts, { userId: userId as Id<'users'> })
  const { formatWeightWithUnit } = useWeightUnit()

  return (
    <Box>
      <Typography component={Link} to="/friends" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Friends
      </Typography>

      {data === undefined ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Loading…
        </Typography>
      ) : data === null ? (
        <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
          Can't view this — you're not friends, and their workouts aren't public.
        </Typography>
      ) : (
        <>
          <Typography noWrap variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
            {data.displayName}
          </Typography>
          {data.workouts.length === 0 ? (
            <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
              No workouts logged yet.
            </Typography>
          ) : (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {data.workouts.map((w) => (
                <Link key={w._id} to={`/friends/${userId}/${w._id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <GlassTile sx={{ p: 2, color: 'text.primary' }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                      <Typography noWrap sx={{ minWidth: 0, fontWeight: 600 }}>
                        {w.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {formatWorkoutDate(w.startedAt)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      {formatDuration(w.durationMs)} · {formatWeightWithUnit(w.totalVolumeKg)} · {w.setCount} sets
                    </Typography>
                    <Box component="ul" sx={{ mt: 1, m: 0, pl: 0, listStyle: 'none' }}>
                      {w.exercises.slice(0, 4).map((ex, i) => (
                        <Typography key={i} component="li" variant="body2" color="text.secondary">
                          {ex.setCount} × {ex.name}
                        </Typography>
                      ))}
                      {w.exercises.length > 4 && (
                        <Typography component="li" variant="caption" color="text.secondary">
                          + {w.exercises.length - 4} more
                        </Typography>
                      )}
                    </Box>
                  </GlassTile>
                </Link>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}

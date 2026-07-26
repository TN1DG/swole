import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { ChecklistIcon, PlateIcon, StopwatchIcon } from '../../components/icons'
import { StatTile } from '../../components/StatTile'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { GlassCard } from '../../components/GlassCard'
import { GlassTile } from '../../components/GlassTile'
import { ActiveWorkout, type FinishSummary } from './ActiveWorkout'

export function WorkoutsPage() {
  const active = useQuery(api.workouts.getActive)
  const start = useMutation(api.workouts.start)
  const routines = useQuery(api.routines.list)
  const startFromRoutine = useMutation(api.routines.startFromRoutine)
  const [summary, setSummary] = useState<FinishSummary | null>(null)

  if (active === undefined) {
    return (
      <Typography sx={{ mt: 8, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  // A workout is running -> show the logging screen.
  if (active !== null) {
    return <ActiveWorkout workout={active} onFinished={setSummary} />
  }

  // Otherwise: start screen (plus a celebration card right after finishing).
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Workout
      </Typography>
      <FirstVisitTip tabKey="workout" />

      {summary && (
        <GlassCard sx={{ mt: 2, borderColor: 'rgb(193 84 31 / 0.4)' }}>
          {summary.discarded ? (
            <Typography color="text.secondary">Empty workout discarded.</Typography>
          ) : (
            <>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                Workout saved! 💪
              </Typography>
              <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
                <StatTile icon={<StopwatchIcon />} label="Duration" value={formatDuration(summary.durationMs)} />
                <StatTile icon={<PlateIcon />} label="Volume" value={`${formatKg(summary.totalVolumeKg)} kg`} />
                <StatTile icon={<ChecklistIcon />} label="Sets" value={String(summary.completedSetCount)} />
                <StatTile label="New PRs" value={summary.prCount > 0 ? `🏆 ${summary.prCount}` : '—'} />
              </Box>
            </>
          )}
          {!summary.discarded && (
            <Button
              component={Link}
              to={`/share/${summary.workoutId}`}
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
            >
              Share as Photo 📸
            </Button>
          )}
          <Button variant="outlined" color="inherit" fullWidth sx={{ mt: 1.5 }} onClick={() => setSummary(null)}>
            Close
          </Button>
        </GlassCard>
      )}

      <Typography color="text.secondary" sx={{ mt: 2 }}>
        Ready to lift?
      </Typography>
      <Button
        variant="contained"
        fullWidth
        sx={{ mt: 2 }}
        onClick={() => void start({ localHour: new Date().getHours() })}
      >
        Start Empty Workout
      </Button>

      {/* Quick start from a routine */}
      {routines && routines.length > 0 && (
        <>
          <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 4 }}>
            Routines
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {routines.map((routine) => (
              <GlassTile
                key={routine._id}
                component="button"
                onClick={() => void startFromRoutine({ routineId: routine._id })}
                sx={{ px: 2, py: 1.5, textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
              >
                <Typography sx={{ fontWeight: 600 }}>{routine.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {routine.exercises.map((ex) => `${ex.targetSets}×${ex.name}`).join(' · ')}
                </Typography>
              </GlassTile>
            ))}
          </Box>
        </>
      )}
    </Box>
  )
}

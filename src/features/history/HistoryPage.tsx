import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { Box, Button, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { formatShortDate, formatWorkoutDate } from '../../lib/dates'
import { BarbellIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { GlassTile } from '../../components/GlassTile'
import { SegmentedControl } from '../../components/SegmentedControl'
import { CalendarView } from './CalendarView'

export function HistoryPage() {
  const [tab, setTab] = useState<'workouts' | 'records' | 'calendar'>('workouts')

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        History
      </Typography>
      <FirstVisitTip tabKey="history" />

      <Box sx={{ mt: 2 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'workouts', label: 'Workouts' },
            { value: 'records', label: 'Records' },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />
      </Box>

      {tab === 'workouts' ? <WorkoutList /> : tab === 'records' ? <RecordList /> : <CalendarView />}
    </Box>
  )
}

function WorkoutList() {
  // Paginated: loads 20 at a time instead of the entire (ever-growing) table.
  const { results: workouts, status, loadMore } = usePaginatedQuery(
    api.history.listCompleted,
    {},
    { initialNumItems: 20 },
  )

  if (status === 'LoadingFirstPage')
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  if (workouts.length === 0)
    return (
      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
        <BarbellIcon size={32} />
        <Typography color="text.secondary">No workouts yet — go lift something!</Typography>
      </Box>
    )

  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {workouts.map((w) => (
        <Link key={w._id} to={`/history/${w._id}`} style={{ textDecoration: 'none', display: 'block' }}>
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
              {formatDuration(w.durationMs)} · {formatKg(w.totalVolumeKg)} kg · {w.setCount} sets
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

      {status !== 'Exhausted' && (
        <Button
          variant="outlined"
          color="inherit"
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(20)}
        >
          {status === 'LoadingMore' ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Box>
  )
}

function RecordList() {
  const records = useQuery(api.prs.listMine)

  if (records === undefined)
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  if (records.length === 0)
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        🏆 Finish a workout to set your first records.
      </Typography>
    )

  const sorted = [...records].sort((a, b) => b.achievedAt - a.achievedAt)

  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {sorted.map((r) => (
        <GlassTile
          key={r._id}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}
        >
          <Box>
            <Typography sx={{ fontWeight: 500 }}>{r.exercise?.name ?? '?'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              🏆 {formatKg(r.bestWeightKg)} kg × {r.bestWeightReps} · est. 1RM {formatKg(r.bestEst1rm)} kg
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {formatShortDate(r.achievedAt)}
          </Typography>
        </GlassTile>
      ))}
    </Box>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { Box, ButtonBase, IconButton, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { formatDuration } from '../../../convex/fitness'
import { useWeightUnit } from '../../lib/useWeightUnit'
import { ProgressRing } from '../../components/ProgressRing'
import { GlassTile } from '../../components/GlassTile'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Day-of-month grouping is done with local `Date` math (not server-side) —
// same convention src/lib/dates.ts already uses. See convex/history.ts's
// listForCalendar for why the range query itself stays timezone-agnostic.
export function CalendarView() {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const startMs = monthCursor.getTime()
  const endMs = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).getTime()

  const profile = useQuery(api.profiles.getMine)
  const workouts = useQuery(api.history.listForCalendar, { startMs, endMs })
  const { formatWeightWithUnit } = useWeightUnit()

  const byDay = useMemo(() => {
    const map = new Map<number, { totalVolumeKg: number; workouts: NonNullable<typeof workouts> }>()
    for (const w of workouts ?? []) {
      const day = new Date(w.startedAt).getDate()
      const existing = map.get(day)
      if (existing) {
        existing.totalVolumeKg += w.totalVolumeKg
        existing.workouts.push(w)
      } else {
        map.set(day, { totalVolumeKg: w.totalVolumeKg, workouts: [w] })
      }
    }
    return map
  }, [workouts])

  if (profile === undefined || workouts === undefined) {
    return (
      <Typography sx={{ mt: 4, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  const goal = profile?.dailyVolumeGoalKg ?? null
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const leadingBlanks = monthCursor.getDay()
  const monthLabel = monthCursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  const selected = selectedDay !== null ? byDay.get(selectedDay) : undefined

  function changeMonth(delta: number) {
    setSelectedDay(null)
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  return (
    <Box sx={{ mt: 2 }}>
      {goal === null && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Set a daily lifting goal on{' '}
          <Typography component={Link} to="/stats" color="primary.main" sx={{ textDecoration: 'underline' }}>
            My Stats
          </Typography>{' '}
          to see progress rings here.
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton aria-label="Previous month" sx={{ color: 'text.secondary' }} onClick={() => changeMonth(-1)}>
          ←
        </IconButton>
        <Typography sx={{ fontWeight: 600 }}>{monthLabel}</Typography>
        <IconButton aria-label="Next month" sx={{ color: 'text.secondary' }} onClick={() => changeMonth(1)}>
          →
        </IconButton>
      </Box>

      <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 1, textAlign: 'center' }}>
        {WEEKDAY_LABELS.map((w, i) => (
          <Typography key={i} variant="caption" color="text.secondary">
            {w}
          </Typography>
        ))}

        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <Box key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const info = byDay.get(day)
          const progress = info && goal ? info.totalVolumeKg / goal : 0
          return (
            <ButtonBase
              key={day}
              onClick={() => info && setSelectedDay(day === selectedDay ? null : day)}
              sx={{
                mx: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                opacity: info ? 1 : 0.4,
              }}
            >
              {info && goal ? (
                <ProgressRing
                  progress={progress}
                  color={progress >= 1 ? '#22c55e' : 'var(--color-accent)'}
                  size={28}
                />
              ) : (
                <Box sx={{ display: 'flex', height: '28px', width: '28px', alignItems: 'center', justifyContent: 'center' }}>
                  {info && <Box sx={{ height: 6, width: 6, borderRadius: '50%', bgcolor: 'primary.main' }} />}
                </Box>
              )}
              <Typography sx={{ fontSize: '10px' }} color="text.secondary">
                {day}
              </Typography>
            </ButtonBase>
          )
        })}
      </Box>

      {selected && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedDay} {monthCursor.toLocaleDateString([], { month: 'short' })} —{' '}
            {formatWeightWithUnit(selected.totalVolumeKg)}
            total
          </Typography>
          {selected.workouts.map((w) => (
            <Link key={w._id} to={`/history/${w._id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <GlassTile sx={{ borderRadius: '16px', p: 2, color: 'text.primary' }}>
                <Typography sx={{ fontWeight: 600 }}>{w.name}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(w.durationMs)} · {formatWeightWithUnit(w.totalVolumeKg)} · {w.setCount} sets
                </Typography>
              </GlassTile>
            </Link>
          ))}
        </Box>
      )}
    </Box>
  )
}

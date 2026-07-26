import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { formatDuration, formatKg } from '../../../convex/fitness'
import { ProgressRing } from '../../components/ProgressRing'

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
    return <p className="mt-8 text-center text-muted">Loading…</p>
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
    <div className="mt-4">
      {goal === null && (
        <p className="mb-3 text-sm text-muted">
          Set a daily lifting goal on{' '}
          <Link to="/stats" className="text-accent underline">
            My Stats
          </Link>{' '}
          to see progress rings here.
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="rounded-lg px-3 py-1.5 text-muted"
        >
          ←
        </button>
        <p className="font-semibold">{monthLabel}</p>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="rounded-lg px-3 py-1.5 text-muted"
        >
          →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <p key={i} className="text-xs text-muted">
            {w}
          </p>
        ))}

        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const info = byDay.get(day)
          const progress = info && goal ? info.totalVolumeKg / goal : 0
          return (
            <button
              key={day}
              type="button"
              onClick={() => info && setSelectedDay(day === selectedDay ? null : day)}
              className={`mx-auto flex flex-col items-center gap-0.5 ${info ? '' : 'opacity-40'}`}
            >
              {info && goal ? (
                <ProgressRing
                  progress={progress}
                  color={progress >= 1 ? '#22c55e' : 'var(--color-accent)'}
                  size={28}
                />
              ) : (
                <div className="flex h-[28px] w-[28px] items-center justify-center">
                  {info && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </div>
              )}
              <span className="text-[10px] text-muted">{day}</span>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-semibold">
            {selectedDay} {monthCursor.toLocaleDateString([], { month: 'short' })} —{' '}
            {formatKg(selected.totalVolumeKg)} kg total
          </p>
          {selected.workouts.map((w) => (
            <Link key={w._id} to={`/history/${w._id}`} className="rounded-2xl glass-tile block p-4">
              <p className="font-semibold">{w.name}</p>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {formatDuration(w.durationMs)} · {formatKg(w.totalVolumeKg)} kg · {w.setCount} sets
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

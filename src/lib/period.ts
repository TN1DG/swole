import { useEffect, useState } from 'react'
import { utcMonthStart, utcWeekStart } from '../../convex/fitness'

export type LeaderboardPeriod = 'week' | 'month'

// How often to re-check whether the period has rolled over. A minute is far
// more often than needed for a boundary that moves weekly, and cheap — the
// state only changes when the computed value actually differs.
const TICK_MS = 60_000

/**
 * The UTC start of the current week or month.
 *
 * Passed to the leaderboard query rather than letting the server read its own
 * clock: a Convex query is not re-run merely because time advanced, so a
 * server-side Date.now() would keep serving last week's board after Sunday
 * midnight. Being a value also means every friend's client shares one cache
 * entry for the whole period.
 *
 * Recomputed on a timer and on tab focus, so an app left open across the
 * boundary rolls over instead of showing a stale board indefinitely.
 */
export function usePeriodStart(period: LeaderboardPeriod): number {
  const compute = () => (period === 'week' ? utcWeekStart(Date.now()) : utcMonthStart(Date.now()))
  const [start, setStart] = useState(compute)

  useEffect(() => {
    const sync = () =>
      setStart((current) => {
        const next = period === 'week' ? utcWeekStart(Date.now()) : utcMonthStart(Date.now())
        return next === current ? current : next
      })

    sync()
    const id = setInterval(sync, TICK_MS)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [period])

  return start
}

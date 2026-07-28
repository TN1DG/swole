import { useEffect, useState } from 'react'
import { Box, Button, Chip, Typography } from '@mui/material'
import { formatDuration } from '../../../convex/fitness'
import { GlassTile } from '../../components/GlassTile'
import { DEFAULT_SEC, formatPreset, PRESETS_SEC } from './restPresets'

const STORAGE_KEY = 'swole.restTimerSeconds'

// Duration is a local preference, not profile data — it's per-device and
// changes constantly between exercises, so it lives in localStorage rather
// than costing a mutation every time it's nudged.
function loadDuration(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw === null ? NaN : parseInt(raw, 10)
    return PRESETS_SEC.includes(parsed) ? parsed : DEFAULT_SEC
  } catch {
    // Private-browsing modes can throw on localStorage access.
    return DEFAULT_SEC
  }
}

function saveDuration(seconds: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(seconds))
  } catch {
    // Non-fatal — the timer still works, the choice just won't persist.
  }
}

/**
 * Rest countdown for the active workout. `autoStartSignal` is a counter the
 * parent bumps every time a set is checked off; each bump (re)starts the
 * countdown. A signal rather than a boolean so back-to-back sets each restart
 * a fresh rest, with no flag to reset in between.
 */
export function RestTimer({ autoStartSignal }: { autoStartSignal: number }) {
  const [durationSec, setDurationSec] = useState(loadDuration)
  // Absolute end timestamp, not a decrementing counter: setInterval is
  // throttled in background tabs, so counting down by hand would drift and
  // under-report exactly when the lifter has switched away. Same reasoning
  // as ElapsedTimer in ActiveWorkout.tsx.
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const remainingMs = endsAt === null ? 0 : Math.max(0, endsAt - now)
  const finished = endsAt !== null && remainingMs === 0
  const running = endsAt !== null && !finished

  // Ticks only while there's time left; flipping to `finished` re-runs this
  // and clears the interval.
  useEffect(() => {
    if (endsAt === null || finished) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [endsAt, finished])

  // Skip the initial render (signal 0) so merely opening a workout with
  // already-completed sets doesn't kick off a rest.
  useEffect(() => {
    if (autoStartSignal === 0) return
    setNow(Date.now())
    setEndsAt(Date.now() + durationSec * 1000)
    // Intentionally keyed on the signal alone: changing the duration mid-rest
    // shouldn't restart the countdown, only the next set completion should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartSignal])

  function start() {
    setNow(Date.now())
    setEndsAt(Date.now() + durationSec * 1000)
  }

  function addThirty() {
    setEndsAt((prev) => (prev === null ? null : prev + 30_000))
  }

  function pickDuration(seconds: number) {
    setDurationSec(seconds)
    saveDuration(seconds)
  }

  return (
    <GlassTile sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography
          sx={{
            minWidth: '4rem',
            fontSize: '1.5rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: finished ? 'success.main' : running ? 'primary.main' : 'text.secondary',
          }}
        >
          {formatDuration(running || finished ? remainingMs : durationSec * 1000)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {finished ? 'Rest complete 💪' : running ? 'Resting…' : 'Rest timer'}
        </Typography>

        {running && (
          <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={addThirty}>
            +30s
          </Button>
        )}
        {running || finished ? (
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            sx={{ flexShrink: 0 }}
            onClick={() => setEndsAt(null)}
          >
            {finished ? 'Dismiss' : 'Skip'}
          </Button>
        ) : (
          <Button size="small" variant="contained" sx={{ flexShrink: 0 }} onClick={start}>
            Start
          </Button>
        )}
      </Box>

      {/* Presets only while idle — mid-rest they'd just be a mis-tap hazard. */}
      {!running && !finished && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {PRESETS_SEC.map((seconds) => (
            <Chip
              key={seconds}
              size="small"
              label={formatPreset(seconds)}
              onClick={() => pickDuration(seconds)}
              color={seconds === durationSec ? 'primary' : 'default'}
              variant={seconds === durationSec ? 'filled' : 'outlined'}
            />
          ))}
        </Box>
      )}
    </GlassTile>
  )
}

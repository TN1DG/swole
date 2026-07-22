import { formatDuration, formatKg } from '../../../convex/fitness'

type Line = {
  id: string
  name: string
  setCount: number
  top: { weightKg: number; reps: number } | undefined
  isPr: boolean
}

// The summary row (duration/volume/sets/PRs) + per-exercise set×weight×rep
// breakdown — identical between the owner's ShareCard and a friend's
// FriendTrophyCard; only what's rendered around it (title, photo) differs.
export function WorkoutBreakdown({
  durationMs,
  volumeKg,
  setCount,
  prCount,
  lines,
}: {
  durationMs: number
  volumeKg: number
  setCount: number
  prCount: number
  lines: Line[]
}) {
  const shown = lines.slice(0, 6)

  return (
    <>
      <div className="flex gap-4 text-sm">
        <span>⏱ {formatDuration(durationMs)}</span>
        <span>🏋 {formatKg(volumeKg)} kg</span>
        <span>{setCount} sets</span>
        {prCount > 0 && (
          <span className="font-semibold text-amber-400">
            🏆 {prCount} PR{prCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-white/20 pt-2">
        {shown.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between py-0.5 text-sm">
            <p className="font-medium">
              {line.setCount} × {line.name}
              {line.isPr && ' 🏆'}
            </p>
            {line.top && line.top.weightKg > 0 && (
              <p className="text-white/80">
                {formatKg(line.top.weightKg)} kg × {line.top.reps}
              </p>
            )}
          </div>
        ))}
        {lines.length > shown.length && (
          <p className="pt-1 text-xs text-white/60">
            + {lines.length - shown.length} more exercises
          </p>
        )}
      </div>
    </>
  )
}

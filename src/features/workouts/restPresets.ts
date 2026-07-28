// Rest-timer duration presets and their labels. Split out of RestTimer.tsx
// so that file only exports a component — exporting anything else alongside
// it breaks React Fast Refresh (and oxlint's react(only-export-components)
// flags it). Being a plain module also makes formatPreset directly testable.

export const PRESETS_SEC = [30, 60, 90, 120, 180]
export const DEFAULT_SEC = 90

// 30 -> "30s", 60 -> "1m", 90 -> "1m 30s". Note the whole-minutes floor:
// plain `seconds / 60` renders 90s as "1.5m 30s".
export function formatPreset(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

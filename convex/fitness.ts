// Pure fitness math, shared by backend (PR computation) and frontend (live flags).

// Estimated one-rep max (Epley formula). For a single rep the lift IS the max.
export function epley1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  if (reps === 1) return weightKg
  return weightKg * (1 + reps / 30)
}

// Does this set beat the stored record? No record yet = automatic first PR.
export function beatsRecord(
  weightKg: number,
  reps: number,
  record: { bestWeightKg: number; bestEst1rm: number } | undefined | null,
): boolean {
  if (weightKg <= 0 || reps <= 0) return false
  if (!record) return true
  return (
    weightKg > record.bestWeightKg ||
    epley1rm(weightKg, reps) > record.bestEst1rm
  )
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// "12345.6" -> "12,345.6" for volume display.
export function formatKg(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

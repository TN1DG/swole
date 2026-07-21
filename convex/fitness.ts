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

// ---------- TDEE / calorie & macro targets ----------
// Shared by the My Stats page (frontend, for the live preview as you type)
// and convex/profiles.ts (backend, so a saved profile's targets can't drift
// from what the UI last showed).

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Goal = 'maintain' | 'cut' | 'bulk' | 'recomp'

export const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentary', hint: 'little or no exercise' },
  { value: 'light', label: 'Light', hint: 'exercise 1-3 days/week' },
  { value: 'moderate', label: 'Moderate', hint: 'exercise 3-5 days/week' },
  { value: 'active', label: 'Active', hint: 'exercise 6-7 days/week' },
  { value: 'very_active', label: 'Very Active', hint: 'hard exercise + physical job' },
] as const satisfies readonly { value: ActivityLevel; label: string; hint: string }[]

export const GOALS = [
  { value: 'maintain', label: 'Maintain', hint: 'stay at your current weight' },
  { value: 'cut', label: 'Cut', hint: 'steady fat loss, ~0.5 kg/week' },
  { value: 'bulk', label: 'Bulk', hint: 'lean muscle gain' },
  { value: 'recomp', label: 'Recomp', hint: 'lose fat and build muscle at once' },
] as const satisfies readonly { value: Goal; label: string; hint: string }[]

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Mifflin-St Jeor: the standard BMR estimate that doesn't need a body-fat %.
export function mifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function tdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel]
}

const GOAL_CALORIE_OFFSET: Record<Goal, number> = {
  maintain: 0,
  cut: -500,
  bulk: 300,
  recomp: -250,
}

// Never suggest less than this, regardless of how low TDEE - offset lands.
const MIN_SAFE_CALORIES = 1200

export function goalCalories(tdeeValue: number, goal: Goal): number {
  return Math.max(MIN_SAFE_CALORIES, Math.round(tdeeValue + GOAL_CALORIE_OFFSET[goal]))
}

// Grams of protein per kg of bodyweight, by goal — sets protein directly off
// bodyweight (the evidence-based way) rather than as a % of calories.
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  cut: 2.2,
  recomp: 2.4,
  maintain: 2.0,
  bulk: 1.8,
}

const FAT_PERCENT_OF_CALORIES = 0.25

export type MacroTargets = {
  calories: number
  proteinG: number
  fatG: number
  carbsG: number
  fiberG: number
}

// Protein (by bodyweight) and fat (a flat % of calories) are set first; carbs
// take whatever calories are left over — the order every macro calculator
// uses. Fiber follows the "14g per 1000 kcal" dietary guideline.
export function macroTargets(calories: number, bodyWeightKg: number, goal: Goal): MacroTargets {
  const proteinG = Math.round(bodyWeightKg * PROTEIN_G_PER_KG[goal])
  const fatG = Math.round((calories * FAT_PERCENT_OF_CALORIES) / 9)
  const remainingCalories = calories - proteinG * 4 - fatG * 9
  const carbsG = Math.max(0, Math.round(remainingCalories / 4))
  const fiberG = Math.round((calories / 1000) * 14)
  return { calories, proteinG, fatG, carbsG, fiberG }
}

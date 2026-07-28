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

// The near-inverse of beatsRecord: a set the record has left behind, shown
// with a red slash ("you've conquered this"). Deliberately NOT `!beatsRecord`
// — that uses `>` on either axis, so a set merely *tying* the record (most
// importantly, the very set that SET the record) would count as behind it.
// Requiring strictly-worse on BOTH axes means a tie earns neither the trophy
// nor the slash.
export function behindRecord(
  weightKg: number,
  reps: number,
  record: { bestWeightKg: number; bestEst1rm: number } | undefined | null,
): boolean {
  if (!record || weightKg <= 0 || reps <= 0) return false
  return weightKg < record.bestWeightKg && epley1rm(weightKg, reps) < record.bestEst1rm
}

// ---------- Unit conversions (canonical storage is always cm/kg) ----------

const KG_PER_LB = 0.45359237
const CM_PER_INCH = 2.54

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

// Whole feet + remaining inches (rounded), e.g. 178cm -> {ft: 5, inch: 10}.
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = Math.round(cm / CM_PER_INCH)
  return { ft: Math.floor(totalInches / 12), inch: totalInches % 12 }
}

export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_INCH
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

// ---------- Swole Points: the scoring model ----------
//
// One currency. The points you earn each week ARE your spendable balance
// (challenge wagers draw on it), and the leaderboard ranks on points EARNED
// in a period — never on the balance, so spending a wager can't drop your
// rank and winning one can't inflate it.
//
// Points come from DISTINCT TRAINING DAYS, not from workouts. Three sessions
// on a Tuesday is one training day. That's what makes the old "log ten empty
// workouts for 100 points" exploit impossible by construction rather than by
// special case.

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS

// ---------- Calendar bucketing (UTC, Monday-anchored) ----------
//
// Fixed to UTC deliberately. The leaderboard is a shared scoreboard, so every
// user has to be scored against the same boundary — a local-time week would
// let a friend in UTC+13 start next week while you're still in this one. The
// cost is that a late Sunday session in a far-western timezone lands in the
// week that just closed; that's stated in the UI rather than hidden.

// Whole days since the epoch, UTC.
export function utcDayIndex(ms: number): number {
  return Math.floor(ms / DAY_MS)
}

// Monday-anchored week ordinal. 1970-01-01 was a Thursday, so day indices are
// shifted by 4 (to 1970-01-05, the first Monday) before dividing. Math.floor
// rather than trunc so pre-epoch timestamps still land on a Monday.
export function utcWeekIndex(ms: number): number {
  return Math.floor((utcDayIndex(ms) - 4) / 7)
}

export function utcWeekStart(ms: number): number {
  return (utcWeekIndex(ms) * 7 + 4) * DAY_MS
}

export function utcWeekEnd(ms: number): number {
  return utcWeekStart(ms) + WEEK_MS
}

// Calendar-month ordinal and bounds, UTC. Date.UTC handles the Dec -> Jan roll.
export function utcMonthIndex(ms: number): number {
  const d = new Date(ms)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

export function utcMonthStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

// Exclusive.
export function utcMonthEnd(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

// ---------- Training days ----------

// Distinct UTC calendar days represented in a set of workout start times.
export function distinctTrainingDays(startedAts: number[]): number {
  return new Set(startedAts.map(utcDayIndex)).size
}

// ---------- The day curve ----------

// Cumulative weekly points by distinct days trained. Marginals are
// 10, 15, 20, 10, 10, 8, 7 — the third day is the biggest single jump,
// because three sessions a week is the habit worth pulling people toward,
// and it flattens after that so a junk seventh session is worth a third of a
// real third one.
export const WEEKLY_DAY_POINTS = [0, 10, 25, 45, 55, 65, 73, 80] as const

export function dayCurvePoints(daysTrained: number): number {
  const days = Math.max(0, Math.min(WEEKLY_DAY_POINTS.length - 1, Math.floor(daysTrained)))
  return WEEKLY_DAY_POINTS[days]
}

// ---------- Garnish (capped) ----------
//
// Volume and PRs are seasoning, not the meal. Together they cap at 50 against
// a day curve worth up to 80, so no amount of either beats simply showing up
// more often. This is the whole point of the rework: the old formula was raw
// kilograms with a +50% streak bonus, which meant a heavy-compound lifter
// outranked a consistent one no matter what.

export const VOLUME_BONUS_CAP = 20
export const VOLUME_KG_PER_POINT = 1000 // cap binds at 20,000 kg in a week

export function volumeBonus(weekVolumeKg: number): number {
  if (!Number.isFinite(weekVolumeKg) || weekVolumeKg <= 0) return 0
  return Math.min(VOLUME_BONUS_CAP, Math.floor(weekVolumeKg / VOLUME_KG_PER_POINT))
}

// This cap is a security control, not a balance knob. beatsRecord() returns
// true for any exercise with no record yet, and a user may create up to
// LIMITS.customExercisesPerUser (300) exercises — so PRs are mintable. The
// cap bounds that exploit at 30 points a week, forever.
export const PR_BONUS_CAP = 30
export const POINTS_PER_PR = 5

export function prBonus(weekPrCount: number): number {
  if (!Number.isFinite(weekPrCount) || weekPrCount <= 0) return 0
  return Math.min(PR_BONUS_CAP, Math.floor(weekPrCount) * POINTS_PER_PR)
}

// ---------- Streak ----------

export const STREAK_BONUS_PER_WEEK = 0.05
export const STREAK_BONUS_CAP_WEEKS = 10 // max +50%

export function streakMultiplier(streakWeeks: number): number {
  return 1 + STREAK_BONUS_PER_WEEK * Math.min(Math.max(0, streakWeeks), STREAK_BONUS_CAP_WEEKS)
}

// Consecutive trained weeks ending at AND INCLUDING `weekIndex`. Returns 0 if
// that week itself is empty.
//
// This is the SCORING streak, so it has to be a deterministic property of the
// week being scored and never of "now" — that determinism is exactly what
// lets finish() and the leaderboard agree without either of them storing it.
export function streakEndingAt(trainedWeeks: Set<number>, weekIndex: number): number {
  let streak = 0
  while (trainedWeeks.has(weekIndex - streak)) streak++
  return streak
}

// The streak to SHOW. Same count, except the current week hasn't finished
// yet, so an untrained Monday morning falls back to the streak as it stood at
// the end of last week. Without this a five-week run reads "0 weeks" every
// Monday until you train. Display only — never feeds a score.
export function displayStreakWeeks(trainedWeeks: Set<number>, currentWeekIndex: number): number {
  if (trainedWeeks.has(currentWeekIndex)) return streakEndingAt(trainedWeeks, currentWeekIndex)
  return streakEndingAt(trainedWeeks, currentWeekIndex - 1)
}

// ---------- The week's score ----------

export type WeekScoreInput = {
  daysTrained: number
  volumeKg: number
  prCount: number
  streakWeeks: number
}

// Every points number in the app derives from this one function.
// Ceiling: (80 + 20 + 30) * 1.5 = 195 in a week.
export function weeklyPoints({ daysTrained, volumeKg, prCount, streakWeeks }: WeekScoreInput): number {
  const base = dayCurvePoints(daysTrained) + volumeBonus(volumeKg) + prBonus(prCount)
  return Math.round(base * streakMultiplier(streakWeeks))
}

/**
 * What each workout in a week is individually worth.
 *
 * Replays the week in chronological order and returns, per workout, the
 * increase in `weeklyPoints` that workout caused when it landed. Because
 * these are consecutive diffs over a growing prefix, they always sum to
 * `weeklyPoints` for the whole week — and THAT is what makes "sum the stamped
 * pointsAwarded over a date range" a valid leaderboard score.
 *
 * The telescoping property is load-bearing; convex/fitness.test.ts pins it.
 */
export function weeklyPointsIncrements(
  workouts: { startedAt: number; volumeKg: number; prCount: number }[],
  streakWeeks: number,
): number[] {
  const chronological = [...workouts].sort((a, b) => a.startedAt - b.startedAt)
  const days: number[] = []
  let volumeKg = 0
  let prCount = 0
  let previous = 0

  return chronological.map((w) => {
    days.push(w.startedAt)
    volumeKg += w.volumeKg
    prCount += w.prCount
    const total = weeklyPoints({
      daysTrained: distinctTrainingDays(days),
      volumeKg,
      prCount,
      streakWeeks,
    })
    const increment = total - previous
    previous = total
    return increment
  })
}

// ---------- Consistency tiers ----------

export type ConsistencyTier = 'none' | 'consistent' | 'dedicated' | 'relentless' | 'iron_will'

// Named badges for a streak — "Consistency Accolades". Checked longest-first.
// Re-anchored so Iron Will lands exactly where STREAK_BONUS_CAP_WEEKS maxes
// the multiplier out: past it there is nothing further to earn, which is why
// the ring stops filling there rather than wrapping round again.
//
// Tiers stay purely cosmetic. Giving them their own bonus would double-count
// the multiplier, which already scales on the same input.
export const CONSISTENCY_TIERS = [
  { min: 10, value: 'iron_will', label: 'Iron Will' },
  { min: 7, value: 'relentless', label: 'Relentless' },
  { min: 4, value: 'dedicated', label: 'Dedicated' },
  { min: 2, value: 'consistent', label: 'Consistent' },
] as const satisfies readonly { min: number; value: ConsistencyTier; label: string }[]

export function consistencyTier(streakWeeks: number): ConsistencyTier {
  for (const tier of CONSISTENCY_TIERS) {
    if (streakWeeks >= tier.min) return tier.value
  }
  return 'none'
}

// The challenge-window streak. Counts consecutive weeks *forward* from
// windowStart with >=1 workout, capped at windowEnd (so a fully-elapsed
// challenge can't over-score) and at `now` (so an in-progress challenge shows
// a legitimate partial score, never future weeks).
//
// A deliberate inconsistency worth knowing about: this measures "weeks since
// we shook hands" — rolling 7-day blocks from the moment the challenge was
// accepted — while everything above measures Mon-Sun calendar weeks. They are
// genuinely different concepts, and converting challenges to calendar weeks
// would change the outcome of every wager currently in flight, so it isn't
// something to tidy up casually.
export function forwardStreakWeeks(
  startedAts: number[],
  windowStart: number,
  windowEnd: number,
  now: number,
): number {
  const totalWeeks = Math.max(0, Math.floor((windowEnd - windowStart) / WEEK_MS))
  const cappedNow = Math.min(now, windowEnd)
  const weeksElapsed = Math.min(
    totalWeeks,
    Math.max(0, Math.ceil((cappedNow - windowStart) / WEEK_MS)),
  )
  const weeksWithWorkout = new Set(
    startedAts
      .filter((t) => t >= windowStart && t < windowEnd)
      .map((t) => Math.floor((t - windowStart) / WEEK_MS)),
  )
  let streak = 0
  while (streak < weeksElapsed && weeksWithWorkout.has(streak)) streak++
  return streak
}

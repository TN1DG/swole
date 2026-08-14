import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_LEVELS,
  beatsRecord,
  behindRecord,
  cmToFtIn,
  consistencyTier,
  GOALS,
  dayCurvePoints,
  displayStreakWeeks,
  distinctTrainingDays,
  epley1rm,
  forwardStreakWeeks,
  formatDuration,
  ftInToCm,
  goalCalories,
  kgToLb,
  lbToKg,
  macroTargets,
  mifflinStJeorBmr,
  prBonus,
  streakEndingAt,
  streakMultiplier,
  tdee,
  utcMonthEnd,
  utcMonthStart,
  utcWeekIndex,
  utcWeekStart,
  volumeBonus,
  weeklyPoints,
  weeklyPointsIncrements,
  WEEKLY_DAY_POINTS,
} from './fitness'

describe('epley1rm', () => {
  it('a single rep IS the max', () => {
    expect(epley1rm(100, 1)).toBe(100)
  })

  it('estimates from weight and reps (Epley)', () => {
    expect(epley1rm(100, 5)).toBeCloseTo(116.67, 1)
    expect(epley1rm(60, 10)).toBeCloseTo(80, 5)
  })

  it('returns 0 for empty sets', () => {
    expect(epley1rm(0, 5)).toBe(0)
    expect(epley1rm(100, 0)).toBe(0)
  })
})

describe('beatsRecord', () => {
  const record = { bestWeightKg: 100, bestEst1rm: epley1rm(100, 5) }

  it('any real set beats "no record yet" (first PR)', () => {
    expect(beatsRecord(50, 1, undefined)).toBe(true)
    expect(beatsRecord(50, 1, null)).toBe(true)
  })

  it('an empty set never counts', () => {
    expect(beatsRecord(0, 5, undefined)).toBe(false)
    expect(beatsRecord(100, 0, record)).toBe(false)
  })

  it('matching the record is not a PR', () => {
    expect(beatsRecord(100, 5, record)).toBe(false)
  })

  it('heavier weight is a PR', () => {
    expect(beatsRecord(102.5, 1, record)).toBe(true)
  })

  it('same weight for more reps is a PR (via estimated 1RM)', () => {
    expect(beatsRecord(100, 8, record)).toBe(true)
  })

  it('lighter set is not a PR', () => {
    expect(beatsRecord(80, 5, record)).toBe(false)
  })
})

describe('behindRecord', () => {
  const record = { bestWeightKg: 100, bestEst1rm: epley1rm(100, 5) }

  it('a strictly worse set is behind the record', () => {
    expect(behindRecord(80, 5, record)).toBe(true)
  })

  it('the set that SET the record is not behind it', () => {
    // The exact record-setting set ties on both axes. This is the case a
    // naive `!beatsRecord` would wrongly slash.
    expect(behindRecord(100, 5, record)).toBe(false)
    expect(beatsRecord(100, 5, record)).toBe(false)
  })

  it('is not behind when it wins on either axis', () => {
    expect(behindRecord(105, 1, record)).toBe(false) // heavier, fewer reps
    expect(behindRecord(95, 20, record)).toBe(false) // lighter, better 1RM
  })

  it('nothing is behind a record that does not exist yet', () => {
    expect(behindRecord(80, 5, undefined)).toBe(false)
    expect(behindRecord(80, 5, null)).toBe(false)
  })

  it('ignores empty sets', () => {
    expect(behindRecord(0, 5, record)).toBe(false)
    expect(behindRecord(80, 0, record)).toBe(false)
  })

  it('never both beats and trails the same record', () => {
    for (const [w, r] of [[80, 5], [100, 5], [105, 1], [95, 20], [120, 10]]) {
      expect(beatsRecord(w, r, record) && behindRecord(w, r, record)).toBe(false)
    }
  })
})

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05')
  })
  it('formats hours', () => {
    expect(formatDuration(3_665_000)).toBe('1:01:05')
  })
})

// Display-only conversions — cm/kg stay the canonical stored units, so the
// round trips below are what keep a saved profile from drifting every time
// the Stats page toggle is flipped.
describe('unit conversions', () => {
  it('converts kg to lb and back', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2)
    expect(lbToKg(220.462)).toBeCloseTo(100, 2)
    expect(lbToKg(kgToLb(83.5))).toBeCloseTo(83.5, 6)
  })

  it('converts cm to feet + inches', () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inch: 11 })
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, inch: 10 })
    // Exactly 6 foot — the inches remainder must roll over to 0, not read 12.
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 })
  })

  it('converts feet + inches back to cm', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 6)
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 6)
  })

  it('survives a cm -> ft/in -> cm round trip within rounding', () => {
    // cmToFtIn rounds to whole inches, so the worst case is half an inch
    // (1.27cm / 2) of drift — e.g. 190cm -> 5'75" -> 190.5cm lands exactly
    // on that bound.
    const maxDriftCm = 2.54 / 2
    for (const cm of [155, 168, 177.8, 190]) {
      const { ft, inch } = cmToFtIn(cm)
      expect(Math.abs(ftInToCm(ft, inch) - cm)).toBeLessThanOrEqual(maxDriftCm)
    }
  })
})

describe('mifflinStJeorBmr', () => {
  it('adds 5 for men, subtracts 161 for women', () => {
    expect(mifflinStJeorBmr(80, 180, 30, 'male')).toBe(1780)
    expect(mifflinStJeorBmr(80, 180, 30, 'female')).toBe(1614)
  })
})

describe('tdee', () => {
  it('scales BMR by the activity multiplier', () => {
    expect(tdee(1780, 'sedentary')).toBeCloseTo(2136, 5)
    expect(tdee(1780, 'moderate')).toBeCloseTo(2759, 5)
  })
})

// The Cut hint used to read "steady fat loss, ~0.5 kg/week" — a weight spelled
// out in English prose inside a shared constant, which stayed in kilograms for
// imperial users and which no `formatKg` grep could ever surface. Rates belong
// in these constants as numbers; units belong to the render.
describe('display constants carry no baked-in units', () => {
  const hints = [...GOALS, ...ACTIVITY_LEVELS].map((entry) => entry.hint)

  it.each(hints)('hint %j names no weight unit', (hint) => {
    expect(hint).not.toMatch(/\b(kg|lb|lbs|kilograms?|pounds?)\b/i)
  })

  it('exposes the cut rate as a number for the UI to convert', () => {
    const cut = GOALS.find((g) => g.value === 'cut')!
    expect(cut).toHaveProperty('rateKgPerWeek', 0.5)
  })
})

describe('goalCalories', () => {
  const t = 2759

  it('applies each goal\'s offset', () => {
    expect(goalCalories(t, 'maintain')).toBe(2759)
    expect(goalCalories(t, 'cut')).toBe(2259)
    expect(goalCalories(t, 'bulk')).toBe(3059)
    expect(goalCalories(t, 'recomp')).toBe(2509)
  })

  it('never suggests below the safe floor', () => {
    expect(goalCalories(1000, 'cut')).toBe(1200)
  })
})

describe('macroTargets', () => {
  it('sets protein by bodyweight, fat by %, carbs from what remains', () => {
    expect(macroTargets(2259, 80, 'cut')).toEqual({
      calories: 2259,
      proteinG: 176,
      fatG: 63,
      carbsG: 247,
      fiberG: 32,
    })
  })

  it('never returns negative carbs even at very low calories', () => {
    const result = macroTargets(1200, 100, 'cut')
    expect(result.carbsG).toBeGreaterThanOrEqual(0)
  })
})

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

describe('consistencyTier', () => {
  it('maps streak length to the right accolade', () => {
    expect(consistencyTier(0)).toBe('none')
    expect(consistencyTier(1)).toBe('none')
    expect(consistencyTier(2)).toBe('consistent')
    expect(consistencyTier(3)).toBe('consistent')
    expect(consistencyTier(4)).toBe('dedicated')
    expect(consistencyTier(8)).toBe('relentless')
    expect(consistencyTier(12)).toBe('iron_will')
    expect(consistencyTier(100)).toBe('iron_will')
  })

  it('puts Iron Will exactly where the streak multiplier maxes out', () => {
    // Past 10 weeks there is nothing further to earn, which is why the ring
    // stops filling there instead of wrapping.
    expect(consistencyTier(6)).toBe('dedicated')
    expect(consistencyTier(7)).toBe('relentless')
    expect(consistencyTier(9)).toBe('relentless')
    expect(consistencyTier(10)).toBe('iron_will')
    expect(streakMultiplier(10)).toBeCloseTo(1.5)
  })
})

describe('forwardStreakWeeks', () => {
  it('is 0 with no workouts', () => {
    const start = 0
    const end = 4 * WEEK_MS
    expect(forwardStreakWeeks([], start, end, end)).toBe(0)
  })

  it('counts one workout in the first week as a streak of 1', () => {
    const start = 0
    const end = 4 * WEEK_MS
    expect(forwardStreakWeeks([start + 2 * DAY_MS], start, end, end)).toBe(1)
  })

  it('stops at the first gap week', () => {
    const start = 0
    const end = 4 * WEEK_MS
    const startedAts = [
      start + 1 * DAY_MS, // week 0
      start + WEEK_MS + 1 * DAY_MS, // week 1
      start + 3 * WEEK_MS + 1 * DAY_MS, // week 3 — gap at week 2 stops it at 2
    ]
    expect(forwardStreakWeeks(startedAts, start, end, end)).toBe(2)
  })

  it('excludes a workout logged exactly at windowEnd', () => {
    const start = 0
    const end = 2 * WEEK_MS
    expect(forwardStreakWeeks([end], start, end, end)).toBe(0)
  })

  it('excludes a workout logged before windowStart', () => {
    const start = WEEK_MS
    const end = 3 * WEEK_MS
    expect(forwardStreakWeeks([start - 1], start, end, end)).toBe(0)
  })

  it('is 0 when now is before windowStart', () => {
    const start = WEEK_MS
    const end = 3 * WEEK_MS
    expect(forwardStreakWeeks([start], start, end, start - 1)).toBe(0)
  })

  it('caps at the total weeks in the window even if now is past windowEnd', () => {
    const start = 0
    const end = 2 * WEEK_MS // only 2 weeks fit
    const startedAts = [start + 1 * DAY_MS, start + WEEK_MS + 1 * DAY_MS]
    // "now" far beyond the window shouldn't let the streak exceed 2.
    expect(forwardStreakWeeks(startedAts, start, end, end + 10 * WEEK_MS)).toBe(2)
  })

  it('a still-active window only credits weeks that have actually elapsed', () => {
    const start = 0
    const end = 4 * WEEK_MS
    const startedAts = [start + 1 * DAY_MS] // only week 0 logged so far
    // "now" is mid-way through week 1 — week 1 has started but no workout in
    // it yet, so the streak should stay at 1, not assume future weeks.
    expect(forwardStreakWeeks(startedAts, start, end, start + WEEK_MS + 1 * DAY_MS)).toBe(1)
  })
})

// ---------- Swole Points scoring ----------

// 2026-01-05 is a Monday. Every calendar assertion below is anchored to it
// rather than to Date.now(), so none of these tests change meaning with the
// day they're run on.
const MONDAY = Date.UTC(2026, 0, 5)

describe('utcWeekStart / utcWeekIndex', () => {
  it('a Monday is its own week start', () => {
    expect(utcWeekStart(MONDAY)).toBe(MONDAY)
    expect(utcWeekStart(MONDAY + 3 * DAY_MS + 5 * 3600_000)).toBe(MONDAY)
  })

  it('the Sunday before belongs to the previous week', () => {
    expect(utcWeekStart(MONDAY - 1)).toBe(MONDAY - WEEK_MS)
    expect(utcWeekIndex(MONDAY - 1)).toBe(utcWeekIndex(MONDAY) - 1)
  })

  it('the last millisecond of a week still belongs to it', () => {
    expect(utcWeekStart(MONDAY + WEEK_MS - 1)).toBe(MONDAY)
  })

  it('lands on a Monday for pre-epoch timestamps too', () => {
    // Guards the Math.floor-on-negatives trap: trunc would round the wrong
    // way here and land the week start on a Thursday.
    const preEpoch = Date.UTC(1969, 5, 15)
    expect(new Date(utcWeekStart(preEpoch)).getUTCDay()).toBe(1)
  })
})

describe('utcMonthStart / utcMonthEnd', () => {
  it('bounds a month', () => {
    const midJan = Date.UTC(2026, 0, 17, 13)
    expect(utcMonthStart(midJan)).toBe(Date.UTC(2026, 0, 1))
    expect(utcMonthEnd(midJan)).toBe(Date.UTC(2026, 1, 1))
  })

  it('rolls December into January of the next year', () => {
    const dec = Date.UTC(2026, 11, 20)
    expect(utcMonthEnd(dec)).toBe(Date.UTC(2027, 0, 1))
  })
})

describe('distinctTrainingDays', () => {
  it('counts three sessions in one day as one day', () => {
    const d = Date.UTC(2026, 0, 6)
    expect(distinctTrainingDays([d, d + 3600_000, d + 7 * 3600_000])).toBe(1)
  })

  it('splits either side of UTC midnight', () => {
    const d = Date.UTC(2026, 0, 6)
    expect(distinctTrainingDays([d + 23 * 3600_000 + 59 * 60_000, d + DAY_MS + 60_000])).toBe(2)
  })

  it('is 0 for no workouts', () => {
    expect(distinctTrainingDays([])).toBe(0)
  })
})

describe('dayCurvePoints', () => {
  it('matches the published curve', () => {
    WEEKLY_DAY_POINTS.forEach((points, days) => {
      expect(dayCurvePoints(days)).toBe(points)
    })
  })

  it('rewards the third day most, then flattens', () => {
    const gain = (d: number) => dayCurvePoints(d) - dayCurvePoints(d - 1)
    expect(gain(3)).toBeGreaterThan(gain(2))
    expect(gain(3)).toBeGreaterThan(gain(4))
    expect(gain(4)).toBeGreaterThanOrEqual(gain(7))
  })

  it('clamps beyond a full week and floors fractions', () => {
    expect(dayCurvePoints(8)).toBe(dayCurvePoints(7))
    expect(dayCurvePoints(-1)).toBe(0)
    expect(dayCurvePoints(2.9)).toBe(dayCurvePoints(2))
  })
})

describe('volumeBonus / prBonus', () => {
  it('scales then stops', () => {
    expect(volumeBonus(0)).toBe(0)
    expect(volumeBonus(4500)).toBe(4)
    expect(volumeBonus(20_000)).toBe(20)
  })

  it('caps volume no matter how much is lifted', () => {
    expect(volumeBonus(1_000_000)).toBe(20)
  })

  it('caps PRs — this one is a security control, not a balance knob', () => {
    // beatsRecord() returns true for any exercise with no record yet, and a
    // user may create 300 custom exercises, so PRs are mintable. The cap is
    // what bounds that exploit.
    expect(prBonus(2)).toBe(10)
    expect(prBonus(6)).toBe(30)
    expect(prBonus(300)).toBe(30)
  })
})

describe('streakEndingAt', () => {
  it('counts back from the week being scored', () => {
    expect(streakEndingAt(new Set([10, 9, 8, 6]), 10)).toBe(3)
  })

  it('is 0 when the scored week itself is empty', () => {
    expect(streakEndingAt(new Set([9, 8, 7]), 10)).toBe(0)
  })
})

describe('displayStreakWeeks', () => {
  it('does not reset to zero just because the new week has not started yet', () => {
    // The headline behaviour of the rework: an untrained Monday morning must
    // not tell someone with a five-week run that their streak is gone.
    const trained = new Set([9, 8, 7, 6, 5])
    expect(displayStreakWeeks(trained, 10)).toBe(5)
  })

  it('includes the current week once it has a workout', () => {
    expect(displayStreakWeeks(new Set([10, 9, 8]), 10)).toBe(3)
  })

  it('is still 0 after a genuine gap', () => {
    expect(displayStreakWeeks(new Set([8, 7]), 10)).toBe(0)
  })
})

describe('weeklyPoints', () => {
  it('is driven by days trained', () => {
    const base = { volumeKg: 0, prCount: 0, streakWeeks: 0 }
    expect(weeklyPoints({ ...base, daysTrained: 1 })).toBe(10)
    expect(weeklyPoints({ ...base, daysTrained: 3 })).toBe(45)
    expect(weeklyPoints({ ...base, daysTrained: 5 })).toBe(65)
  })

  it('applies the streak multiplier to the whole base', () => {
    expect(
      weeklyPoints({ daysTrained: 4, volumeKg: 28_400, prCount: 2, streakWeeks: 7 }),
    ).toBe(Math.round((55 + 20 + 10) * 1.35))
  })

  it('tops out at 195', () => {
    const max = weeklyPoints({
      daysTrained: 7,
      volumeKg: 10_000_000,
      prCount: 999,
      streakWeeks: 999,
    })
    expect(max).toBe(195)
  })

  it('lets consistency beat volume — the whole point of the rework', () => {
    const oneHugeDay = weeklyPoints({ daysTrained: 1, volumeKg: 40_000, prCount: 2, streakWeeks: 0 })
    const threeModestDays = weeklyPoints({ daysTrained: 3, volumeKg: 3_000, prCount: 0, streakWeeks: 2 })
    expect(threeModestDays).toBeGreaterThan(oneHugeDay)
  })
})

describe('weeklyPointsIncrements', () => {
  const day = (n: number) => Date.UTC(2026, 0, 5 + n)

  it('telescopes — increments always sum to the week total', () => {
    // This invariant is the entire basis for summing pointsAwarded over a
    // date range to get a leaderboard score. If it breaks, the balance and
    // the board silently disagree.
    const workouts = [
      { startedAt: day(0), volumeKg: 3000, prCount: 1 },
      { startedAt: day(0) + 3600_000, volumeKg: 1200, prCount: 0 },
      { startedAt: day(2), volumeKg: 5000, prCount: 2 },
      { startedAt: day(4), volumeKg: 800, prCount: 0 },
    ]
    for (const streak of [0, 3, 20]) {
      const total = weeklyPoints({
        daysTrained: 3,
        volumeKg: 10_000,
        prCount: 3,
        streakWeeks: streak,
      })
      const sum = weeklyPointsIncrements(workouts, streak).reduce((a, b) => a + b, 0)
      expect(sum).toBe(total)
    }
  })

  it('gives a second workout on the same day no day-curve points', () => {
    const [first, second] = weeklyPointsIncrements(
      [
        { startedAt: day(0), volumeKg: 0, prCount: 0 },
        { startedAt: day(0) + 4 * 3600_000, volumeKg: 0, prCount: 0 },
      ],
      0,
    )
    expect(first).toBe(10)
    expect(second).toBe(0) // the anti-farming property, by construction
  })

  it('is order-independent — it sorts chronologically itself', () => {
    const a = weeklyPointsIncrements(
      [
        { startedAt: day(3), volumeKg: 1000, prCount: 0 },
        { startedAt: day(1), volumeKg: 2000, prCount: 0 },
      ],
      0,
    )
    expect(a.reduce((x, y) => x + y, 0)).toBe(
      weeklyPoints({ daysTrained: 2, volumeKg: 3000, prCount: 0, streakWeeks: 0 }),
    )
  })

  it('never awards a negative increment for an added workout', () => {
    const increments = weeklyPointsIncrements(
      [
        { startedAt: day(0), volumeKg: 500, prCount: 0 },
        { startedAt: day(1), volumeKg: 500, prCount: 0 },
        { startedAt: day(2), volumeKg: 500, prCount: 0 },
      ],
      4,
    )
    for (const i of increments) expect(i).toBeGreaterThanOrEqual(0)
  })
})

describe('streakMultiplier', () => {
  it('adds 5% per week, capped at +50%', () => {
    expect(streakMultiplier(0)).toBe(1)
    expect(streakMultiplier(1)).toBeCloseTo(1.05)
    expect(streakMultiplier(10)).toBeCloseTo(1.5)
    expect(streakMultiplier(40)).toBeCloseTo(1.5)
  })
})

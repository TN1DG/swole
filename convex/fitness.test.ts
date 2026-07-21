import { describe, expect, it } from 'vitest'
import {
  beatsRecord,
  consistencyStreakWeeks,
  consistencyTier,
  epley1rm,
  formatDuration,
  goalCalories,
  leaderboardScore,
  macroTargets,
  mifflinStJeorBmr,
  tdee,
  weeksAgo,
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

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05')
  })
  it('formats hours', () => {
    expect(formatDuration(3_665_000)).toBe('1:01:05')
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

describe('weeksAgo', () => {
  it('buckets into rolling 7-day windows from now', () => {
    const now = Date.now()
    expect(weeksAgo(now, now)).toBe(0)
    expect(weeksAgo(now - 6 * DAY_MS, now)).toBe(0)
    expect(weeksAgo(now - 8 * DAY_MS, now)).toBe(1)
    expect(weeksAgo(now - 15 * DAY_MS, now)).toBe(2)
  })
})

describe('consistencyStreakWeeks', () => {
  it('counts consecutive weeks with a workout, stopping at the first gap', () => {
    const now = Date.now()
    const startedAts = [
      now - 0.1 * WEEK_MS, // week 0
      now - 1.5 * WEEK_MS, // week 1
      now - 2.9 * WEEK_MS, // week 2
      now - 4.2 * WEEK_MS, // week 4 — gap at week 3 stops the streak at 3
    ]
    expect(consistencyStreakWeeks(startedAts, now)).toBe(3)
  })

  it('is 0 if there was no workout this week, even with a long history', () => {
    const now = Date.now()
    const startedAts = [now - 1.2 * WEEK_MS, now - 2.2 * WEEK_MS, now - 3.2 * WEEK_MS]
    expect(consistencyStreakWeeks(startedAts, now)).toBe(0)
  })
})

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
})

describe('leaderboardScore', () => {
  it('adds 5% per consecutive week, capped at +50%', () => {
    expect(leaderboardScore(1000, 0)).toBe(1000)
    expect(leaderboardScore(1000, 1)).toBe(1050)
    expect(leaderboardScore(1000, 10)).toBe(1500)
    expect(leaderboardScore(1000, 20)).toBe(1500) // capped, same as 10
  })
})

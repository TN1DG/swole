import { describe, expect, it } from 'vitest'
import { beatsRecord, epley1rm, formatDuration } from './fitness'

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

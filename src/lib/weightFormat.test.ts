import { describe, expect, it } from 'vitest'
import { formatWeightIn, formatWeightWithUnitIn, toDisplayWeight } from './weightFormat'

describe('toDisplayWeight', () => {
  it('leaves kg alone — storage is already canonical', () => {
    expect(toDisplayWeight('kg', 100)).toBe(100)
    expect(toDisplayWeight('kg', 0)).toBe(0)
  })

  it('converts to lb at full precision, rounding only at format time', () => {
    expect(toDisplayWeight('lb', 100)).toBeCloseTo(220.46226, 5)
  })
})

describe('formatWeightIn', () => {
  it('trims the long tail a kg -> lb conversion leaves behind', () => {
    expect(formatWeightIn('lb', 100)).toBe('220.5')
  })

  it('keeps the thousands separator on big volume totals', () => {
    expect(formatWeightIn('kg', 12345.6)).toBe('12,345.6')
  })

  it('drops trailing zeros rather than padding to 1dp', () => {
    expect(formatWeightIn('kg', 100)).toBe('100')
  })
})

describe('formatWeightWithUnitIn', () => {
  it('appends the unit the number is actually in', () => {
    expect(formatWeightWithUnitIn('kg', 100)).toBe('100 kg')
    expect(formatWeightWithUnitIn('lb', 100)).toBe('220.5 lb')
  })

  // A volume total of 0 is a real state (a workout with only warm-ups), and
  // it must not render as a bare "0" with no unit.
  it('still names the unit at zero', () => {
    expect(formatWeightWithUnitIn('lb', 0)).toBe('0 lb')
  })
})

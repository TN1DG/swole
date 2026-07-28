import { describe, expect, it } from 'vitest'
import { formatPreset } from './restPresets'

// Regression guard: the first cut used `seconds / 60`, which rendered the
// default 90s preset as "1.5m 30s" in the UI.
describe('formatPreset', () => {
  it('shows sub-minute durations in seconds', () => {
    expect(formatPreset(30)).toBe('30s')
  })

  it('shows whole minutes without a seconds part', () => {
    expect(formatPreset(60)).toBe('1m')
    expect(formatPreset(120)).toBe('2m')
    expect(formatPreset(180)).toBe('3m')
  })

  it('floors to whole minutes plus a remainder', () => {
    expect(formatPreset(90)).toBe('1m 30s')
    expect(formatPreset(150)).toBe('2m 30s')
  })
})

import { describe, expect, it } from 'vitest'
import { kgToLb } from '../../convex/fitness'
import {
  bodyFieldsFor,
  canonicalBody,
  convertBodyFields,
  EMPTY_BODY_FIELDS,
  round1,
} from './bodyUnits'

describe('round1', () => {
  // Derived rather than written out: the raw value has more significant
  // digits than a float can hold, so a literal would be a lie.
  it('trims a kg -> lb conversion to one decimal', () => {
    expect(round1(kgToLb(80))).toBe(176.4)
  })
})

describe('bodyFieldsFor', () => {
  it('fills cm and kg straight through for metric', () => {
    expect(bodyFieldsFor('kg', { heightCm: 180, weightKg: 100 })).toEqual({
      ...EMPTY_BODY_FIELDS,
      height: '180',
      weight: '100',
    })
  })

  it('splits height into feet and inches for imperial', () => {
    expect(bodyFieldsFor('lb', { heightCm: 180, weightKg: 100 })).toEqual({
      ...EMPTY_BODY_FIELDS,
      heightFt: '5',
      heightIn: '11',
      weight: '220.5',
    })
  })

  it('leaves fields blank when the profile has no body stats yet', () => {
    expect(bodyFieldsFor('lb', { heightCm: null, weightKg: null })).toEqual(EMPTY_BODY_FIELDS)
    expect(bodyFieldsFor('kg', {})).toEqual(EMPTY_BODY_FIELDS)
  })
})

describe('convertBodyFields', () => {
  it('re-expresses typed metric values as imperial', () => {
    const next = convertBodyFields('lb', { ...EMPTY_BODY_FIELDS, height: '180', weight: '100' })
    expect(next.heightFt).toBe('5')
    expect(next.heightIn).toBe('11')
    expect(next.weight).toBe('220.5')
  })

  it('re-expresses typed imperial values as metric', () => {
    const next = convertBodyFields('kg', {
      ...EMPTY_BODY_FIELDS,
      heightFt: '5',
      heightIn: '11',
      weight: '220.5',
    })
    expect(next.height).toBe('180')
    expect(next.weight).toBe('100')
  })

  // The point of keeping both height halves in state: flipping back and forth
  // must not grind the number down through repeated rounding.
  it('survives a round trip without drifting', () => {
    const start = { ...EMPTY_BODY_FIELDS, height: '180', weight: '100' }
    const back = convertBodyFields('kg', convertBodyFields('lb', start))
    expect(back.height).toBe('180')
    expect(back.weight).toBe('100')
  })

  // Someone mid-keystroke should not watch "NaN" appear in the box.
  it('leaves blank and nonsense entries alone', () => {
    expect(convertBodyFields('lb', EMPTY_BODY_FIELDS)).toEqual(EMPTY_BODY_FIELDS)
    expect(convertBodyFields('kg', EMPTY_BODY_FIELDS)).toEqual(EMPTY_BODY_FIELDS)

    const partial = { ...EMPTY_BODY_FIELDS, height: 'abc', weight: '' }
    expect(convertBodyFields('lb', partial).weight).toBe('')
    expect(convertBodyFields('lb', partial).heightFt).toBe('')
  })
})

describe('canonicalBody', () => {
  it('passes metric through untouched', () => {
    expect(canonicalBody('kg', { ...EMPTY_BODY_FIELDS, height: '180', weight: '100' })).toEqual({
      heightCm: 180,
      weightKg: 100,
    })
  })

  // The bug this whole change exists to prevent: 185 entered by someone
  // thinking in pounds must not be stored as 185 kg.
  it('converts imperial entry to canonical cm/kg', () => {
    const { heightCm, weightKg } = canonicalBody('lb', {
      ...EMPTY_BODY_FIELDS,
      heightFt: '6',
      heightIn: '1',
      weight: '185',
    })
    expect(heightCm).toBeCloseTo(185.42, 2)
    expect(weightKg).toBeCloseTo(83.91, 2)
    expect(weightKg).toBeLessThan(185)
  })

  it('treats a missing inches box as zero, not as a broken height', () => {
    const { heightCm } = canonicalBody('lb', { ...EMPTY_BODY_FIELDS, heightFt: '6', weight: '180' })
    expect(heightCm).toBeCloseTo(182.88, 2)
  })

  it('returns NaN for unparseable input rather than a plausible zero', () => {
    const { heightCm, weightKg } = canonicalBody('kg', EMPTY_BODY_FIELDS)
    expect(Number.isNaN(heightCm)).toBe(true)
    expect(Number.isNaN(weightKg)).toBe(true)
  })
})

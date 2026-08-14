import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from '../../convex/fitness'
import type { WeightUnit } from './weightFormat'

/**
 * Height and weight as the *form* holds them — always strings, always in
 * whichever unit is currently selected.
 *
 * `height` carries cm and is used when the unit is 'kg'; `heightFt`/`heightIn`
 * carry feet and inches and are used when it is 'lb'. Both halves are kept so
 * flipping the toggle twice returns you to what you typed, rather than to a
 * rounded round trip of it.
 */
export type BodyFields = {
  height: string
  heightFt: string
  heightIn: string
  weight: string
}

export const EMPTY_BODY_FIELDS: BodyFields = {
  height: '',
  heightFt: '',
  heightIn: '',
  weight: '',
}

/**
 * One decimal is plenty for a converted bodyweight — it avoids showing
 * "176.36981..." lb after a kg -> lb round trip.
 */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function parsePositive(value: string): number | null {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Saved cm/kg -> the form fields for `unit`. For pre-filling a form from a
 * profile that already has body stats.
 */
export function bodyFieldsFor(
  unit: WeightUnit,
  saved: { heightCm?: number | null; weightKg?: number | null },
): BodyFields {
  const fields = { ...EMPTY_BODY_FIELDS }

  if (saved.heightCm) {
    if (unit === 'lb') {
      const { ft, inch } = cmToFtIn(saved.heightCm)
      fields.heightFt = String(ft)
      fields.heightIn = String(inch)
    } else {
      fields.height = String(saved.heightCm)
    }
  }
  if (saved.weightKg) {
    fields.weight = String(unit === 'lb' ? round1(kgToLb(saved.weightKg)) : saved.weightKg)
  }
  return fields
}

/**
 * Re-express what is already typed in the newly chosen unit, so the numbers
 * don't jump when the toggle flips. `to` is the unit being switched *to*; the
 * fields are read as being in the other one.
 *
 * Blank or nonsense entries stay blank — half-typed input is not worth
 * converting, and `parseFloat('') === NaN` would otherwise write "NaN" into a
 * field the user is still working on.
 */
export function convertBodyFields(to: WeightUnit, fields: BodyFields): BodyFields {
  const next = { ...fields }

  if (to === 'lb') {
    const cm = parsePositive(fields.height)
    if (cm !== null) {
      const { ft, inch } = cmToFtIn(cm)
      next.heightFt = String(ft)
      next.heightIn = String(inch)
    }
    const kg = parsePositive(fields.weight)
    if (kg !== null) next.weight = String(round1(kgToLb(kg)))
  } else {
    const ft = parseFloat(fields.heightFt) || 0
    const inch = parseFloat(fields.heightIn) || 0
    if (ft > 0 || inch > 0) next.height = String(Math.round(ftInToCm(ft, inch)))
    const lb = parsePositive(fields.weight)
    if (lb !== null) next.weight = String(round1(lbToKg(lb)))
  }
  return next
}

/**
 * The form fields -> the canonical cm/kg that is the only thing ever stored or
 * fed to the calorie math.
 *
 * Returns NaN for anything unparseable rather than a fallback, so a caller
 * that forgets to validate gets an obviously-broken number instead of a
 * plausible wrong one — a silent 0kg bodyweight would sail into the TDEE
 * formula and produce a confident, meaningless calorie target.
 */
export function canonicalBody(
  unit: WeightUnit,
  fields: BodyFields,
): { heightCm: number; weightKg: number } {
  if (unit === 'lb') {
    return {
      heightCm: ftInToCm(parseFloat(fields.heightFt) || 0, parseFloat(fields.heightIn) || 0),
      weightKg: lbToKg(parseFloat(fields.weight)),
    }
  }
  return { heightCm: parseFloat(fields.height), weightKg: parseFloat(fields.weight) }
}

import { formatKg, kgToLb } from '../../convex/fitness'

export type WeightUnit = 'kg' | 'lb'

/**
 * Display formatting for a stored weight.
 *
 * Storage is canonically kg everywhere; these convert at the very last step,
 * for display only. Nothing written back to the database goes through here.
 *
 * Kept free of React and Convex so it can be unit-tested directly — the hook
 * that supplies `unit` from the profile lives in useWeightUnit.ts.
 */
export function toDisplayWeight(unit: WeightUnit, kg: number): number {
  return unit === 'lb' ? kgToLb(kg) : kg
}

/**
 * Number only — for table cells whose column header already names the unit.
 * Rounds to 1dp, which also hides the long tail a kg->lb conversion leaves
 * behind (100kg -> 220.46226218…lb).
 */
export function formatWeightIn(unit: WeightUnit, kg: number): string {
  return formatKg(toDisplayWeight(unit, kg))
}

/** Number + unit, e.g. "1,234.5 lb" — for summary lines that carry no header. */
export function formatWeightWithUnitIn(unit: WeightUnit, kg: number): string {
  return `${formatWeightIn(unit, kg)} ${unit}`
}

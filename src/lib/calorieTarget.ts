import { MIN_SAFE_CALORIES, type MacroOverride } from '../../convex/fitness'
import { LIMITS } from '../../convex/validation'

// The server has the final say (profiles.ts:setCalorieTarget). This is the same
// check run early, so the form can explain itself without a round trip.
export function calorieInputError(value: string): string | null {
  const calories = Number(value)
  if (
    !value.trim() ||
    !Number.isFinite(calories) ||
    calories < LIMITS.calorieTargetMin ||
    calories > LIMITS.calorieTargetMax
  ) {
    return `Enter a number between ${LIMITS.calorieTargetMin} and ${LIMITS.calorieTargetMax}`
  }
  return null
}

export function isLowCalorieTarget(value: string): boolean {
  const calories = Number(value)
  return value.trim() !== '' && Number.isFinite(calories) && calories < MIN_SAFE_CALORIES
}

export const LOW_CALORIE_CAUTION = `That's under ${MIN_SAFE_CALORIES} kcal, which is hard to sustain safely. Consider checking with a doctor or dietitian.`

const MACRO_KEYS = ['proteinG', 'carbsG', 'fatG', 'fiberG'] as const
type MacroKey = (typeof MACRO_KEYS)[number]

// What's in the breakdown boxes, as typed. Blank means "use the suggestion".
export type MacroInputs = Record<MacroKey, string>

export const EMPTY_MACRO_INPUTS: MacroInputs = { proteinG: '', carbsG: '', fatG: '', fiberG: '' }

export function macroInputsFrom(override: MacroOverride | null | undefined): MacroInputs {
  const text = (key: MacroKey) => (override?.[key] === undefined ? '' : String(override[key]))
  return {
    proteinG: text('proteinG'),
    carbsG: text('carbsG'),
    fatG: text('fatG'),
    fiberG: text('fiberG'),
  }
}

function validMacro(value: string): number | undefined {
  const grams = Number(value)
  if (!value.trim() || !Number.isFinite(grams) || grams < 0 || grams > LIMITS.macroGrams) {
    return undefined
  }
  return grams
}

export function macroInputError(inputs: MacroInputs): string | null {
  const bad = MACRO_KEYS.some((key) => inputs[key].trim() && validMacro(inputs[key]) === undefined)
  return bad ? `Enter macros as grams between 0 and ${LIMITS.macroGrams}` : null
}

// Only what was actually typed, or undefined if every box is blank.
export function macroInputsToOverride(inputs: MacroInputs): MacroOverride | undefined {
  const override: MacroOverride = {}
  for (const key of MACRO_KEYS) {
    const grams = validMacro(inputs[key])
    if (grams !== undefined) override[key] = grams
  }
  return Object.keys(override).length > 0 ? override : undefined
}

import { MIN_SAFE_CALORIES } from '../../convex/fitness'
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

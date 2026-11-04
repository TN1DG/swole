import { Box, TextField, Typography } from '@mui/material'
import { caloriesFromMacros, resolveMacroTargets, type Goal } from '../../../convex/fitness'
import { macroInputsToOverride, type MacroInputs } from '../../lib/calorieTarget'

const FIELDS = [
  { key: 'proteinG', label: 'Protein target (g)' },
  { key: 'carbsG', label: 'Carbs target (g)' },
  { key: 'fatG', label: 'Fat target (g)' },
  { key: 'fiberG', label: 'Fiber target (g)' },
] as const

// The breakdown of a self-set calorie target. Each placeholder is the suggested
// number for the calories currently typed, from the user's weight and goal, so it
// moves as they type; a box left blank simply uses it. Typing protein or fat also
// rebalances the suggested carbs, which is what's left of the calories.
export function MacroTargetFields({
  calories,
  weightKg,
  goal,
  values,
  onChange,
}: {
  calories: number
  weightKg: number
  goal: Goal
  values: MacroInputs
  onChange: (values: MacroInputs) => void
}) {
  const resolved = resolveMacroTargets(calories, weightKg, goal, macroInputsToOverride(values))
  const total = caloriesFromMacros(resolved.proteinG, resolved.carbsG, resolved.fatG)
  // Rounding alone can leave a few kcal either way, which isn't worth mentioning.
  const offBy = total - calories
  const mismatched = Math.abs(offBy) > 20

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Daily breakdown
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Suggested from your weight and goal. Type over any you want to change.
      </Typography>
      <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
        {FIELDS.map(({ key, label }) => (
          <TextField
            key={key}
            label={label}
            value={values[key]}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            placeholder={String(resolved[key])}
            size="small"
            slotProps={{
              htmlInput: { inputMode: 'numeric' },
              // Keeps the label out of the way, so the placeholder always shows.
              inputLabel: { shrink: true },
            }}
          />
        ))}
      </Box>
      {mismatched && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          These add up to {total} kcal, {Math.abs(offBy)} {offBy > 0 ? 'over' : 'under'} your target.
        </Typography>
      )}
    </Box>
  )
}

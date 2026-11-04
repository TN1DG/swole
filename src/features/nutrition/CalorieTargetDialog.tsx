import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Goal, MacroOverride } from '../../../convex/fitness'
import {
  calorieInputError,
  isLowCalorieTarget,
  LOW_CALORIE_CAUTION,
  macroInputError,
  macroInputsFrom,
  macroInputsToOverride,
} from '../../lib/calorieTarget'
import { errorMessage } from '../../lib/errors'
import { MacroTargetFields } from './MacroTargetFields'

export function CalorieTargetDialog({
  current,
  currentMacros,
  goal,
  goalCalories,
  weightKg,
  isCustom,
  onClose,
}: {
  current: number
  currentMacros: MacroOverride | null
  goal: Goal
  goalCalories: number
  weightKg: number
  isCustom: boolean
  onClose: () => void
}) {
  const setCalorieTarget = useMutation(api.profiles.setCalorieTarget)
  const [value, setValue] = useState(String(current))
  const [macros, setMacros] = useState(() => macroInputsFrom(currentMacros))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(args: { calories: number | null; macros?: MacroOverride }) {
    setError(null)
    setSaving(true)
    try {
      await setCalorieTarget(args)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
      setSaving(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const inputError = calorieInputError(value) ?? macroInputError(macros)
    if (inputError) {
      setError(inputError)
      return
    }
    const override = macroInputsToOverride(macros)
    void save({ calories: Number(value), ...(override && { macros: override }) })
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>Daily calorie target</DialogTitle>
        <DialogContent>
          <TextField
            label="Calories per day"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            fullWidth
            sx={{ mt: 1 }}
            helperText={
              isLowCalorieTarget(value)
                ? LOW_CALORIE_CAUTION
                : `Your ${goal} goal suggests ${goalCalories} kcal.`
            }
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          <MacroTargetFields
            // Half-typed or out-of-range calories keep the last sensible suggestion.
            calories={calorieInputError(value) ? current : Number(value)}
            weightKg={weightKg}
            goal={goal}
            values={macros}
            onChange={setMacros}
          />
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {isCustom && (
            <Button
              color="inherit"
              disabled={saving}
              sx={{ mr: 'auto' }}
              onClick={() => void save({ calories: null })}
            >
              Use goal's numbers
            </Button>
          )}
          <Button color="inherit" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

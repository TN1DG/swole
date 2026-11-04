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
import { calorieInputError, isLowCalorieTarget, LOW_CALORIE_CAUTION } from '../../lib/calorieTarget'
import { errorMessage } from '../../lib/errors'

export function CalorieTargetDialog({
  current,
  goalLabel,
  goalCalories,
  isCustom,
  onClose,
}: {
  current: number
  goalLabel: string
  goalCalories: number
  isCustom: boolean
  onClose: () => void
}) {
  const setCalorieTarget = useMutation(api.profiles.setCalorieTarget)
  const [value, setValue] = useState(String(current))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(calories: number | null) {
    setError(null)
    setSaving(true)
    try {
      await setCalorieTarget({ calories })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
      setSaving(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const inputError = calorieInputError(value)
    if (inputError) {
      setError(inputError)
      return
    }
    void save(Number(value))
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
                : `Your ${goalLabel} goal suggests ${goalCalories} kcal. Your macros adjust to match.`
            }
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          {isCustom && (
            <Button color="inherit" disabled={saving} sx={{ mr: 'auto' }} onClick={() => void save(null)}>
              Use goal's number
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

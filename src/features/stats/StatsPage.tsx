import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, MenuItem, Select, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import {
  ACTIVITY_LEVELS,
  mifflinStJeorBmr,
  tdee,
  type ActivityLevel,
  type Sex,
} from '../../../convex/fitness'
import { CalorieBreakdown } from './CalorieBreakdown'
import { errorMessage } from '../../lib/errors'
import { SegmentedControl } from '../../components/SegmentedControl'

export function StatsPage() {
  const profile = useQuery(api.profiles.getMine)
  const updateBodyStats = useMutation(api.profiles.updateBodyStats)
  const setDailyVolumeGoal = useMutation(api.profiles.setDailyVolumeGoal)

  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dailyGoal, setDailyGoal] = useState('')
  const [goalSaved, setGoalSaved] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)

  // Pull saved values into the form exactly once, the first time they load —
  // otherwise a later reactive refetch (e.g. after saving) would clobber
  // whatever the user is mid-typing.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated || profile === undefined) return
    if (profile?.heightCm) setHeight(String(profile.heightCm))
    if (profile?.weightKg) setWeight(String(profile.weightKg))
    if (profile?.age) setAge(String(profile.age))
    if (profile?.sex) setSex(profile.sex)
    if (profile?.activityLevel) setActivityLevel(profile.activityLevel)
    if (profile?.dailyVolumeGoalKg) setDailyGoal(String(profile.dailyVolumeGoalKg))
    setHydrated(true)
  }, [profile, hydrated])

  if (profile === undefined) {
    return (
      <Typography sx={{ mt: 8, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  const heightCm = parseFloat(height)
  const weightKg = parseFloat(weight)
  const ageYears = parseInt(age, 10)
  const hasAllInputs =
    Number.isFinite(heightCm) &&
    heightCm > 0 &&
    Number.isFinite(weightKg) &&
    weightKg > 0 &&
    Number.isFinite(ageYears) &&
    ageYears > 0

  const bmr = hasAllInputs ? mifflinStJeorBmr(weightKg, heightCm, ageYears, sex) : null
  const tdeeValue = bmr !== null ? tdee(bmr, activityLevel) : null

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    try {
      await updateBodyStats({ heightCm, weightKg, age: ageYears, sex, activityLevel })
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    }
  }

  async function handleSaveGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGoalError(null)
    setGoalSaved(false)
    try {
      await setDailyVolumeGoal({ dailyVolumeGoalKg: parseFloat(dailyGoal) })
      setGoalSaved(true)
    } catch (err) {
      setGoalError(errorMessage(err, 'Could not save.'))
    }
  }

  return (
    <Box>
      <Typography component={Link} to="/profile" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Profile
      </Typography>
      <Typography variant="h5" sx={{ mt: 1, fontWeight: 'bold' }}>
        My Stats
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Used to estimate your daily calorie needs — nothing here is shared.
      </Typography>

      <Box component="form" onSubmit={handleSave} sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Height (cm)
            </Typography>
            <TextField
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              placeholder="180"
              fullWidth
              sx={{ mt: 0.5 }}
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Weight (kg)
            </Typography>
            <TextField
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              placeholder="80"
              fullWidth
              sx={{ mt: 0.5 }}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary">
            Age
          </Typography>
          <TextField
            value={age}
            onChange={(e) => setAge(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            placeholder="30"
            fullWidth
            sx={{ mt: 0.5 }}
          />
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary">
            Sex (used for the calorie formula)
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <SegmentedControl
              value={sex}
              onChange={setSex}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary">
            Activity level
          </Typography>
          <Select
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            fullWidth
            sx={{ mt: 0.5 }}
            inputProps={{ 'aria-label': 'Activity level' }}
          >
            {ACTIVITY_LEVELS.map((level) => (
              <MenuItem key={level.value} value={level.value}>
                {level.label} — {level.hint}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {saved && (
          <Typography variant="body2" color="success.main">
            Saved.
          </Typography>
        )}

        <Button type="submit" variant="contained" fullWidth sx={{ mt: 0.5 }}>
          Save
        </Button>
      </Box>

      {tdeeValue !== null && bmr !== null ? (
        <Box sx={{ mt: 3 }}>
          <CalorieBreakdown bmr={bmr} tdeeValue={tdeeValue} weightKg={weightKg} />
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
          Fill in height, weight, and age above to see your calorie and macro goals.
        </Typography>
      )}

      <Typography variant="h6" sx={{ mt: 4, fontWeight: 'bold' }}>
        Daily Lifting Goal
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Powers the rings on History → Calendar — one target, every day.
      </Typography>
      <Box component="form" onSubmit={handleSaveGoal} sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Daily lifting goal (kg)
          </Typography>
          <TextField
            value={dailyGoal}
            onChange={(e) => setDailyGoal(e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            placeholder="2000"
            fullWidth
            sx={{ mt: 0.5 }}
          />
        </Box>

        {goalError && (
          <Typography variant="body2" color="error">
            {goalError}
          </Typography>
        )}
        {goalSaved && (
          <Typography variant="body2" color="success.main">
            Saved.
          </Typography>
        )}

        <Button type="submit" variant="contained" fullWidth sx={{ mt: 0.5 }}>
          Save Goal
        </Button>
      </Box>
    </Box>
  )
}

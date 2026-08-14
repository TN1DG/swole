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
import {
  bodyFieldsFor,
  canonicalBody,
  convertBodyFields,
  EMPTY_BODY_FIELDS,
  type BodyFields,
} from '../../lib/bodyUnits'
import type { WeightUnit } from '../../lib/weightFormat'
import { SegmentedControl } from '../../components/SegmentedControl'

export function StatsPage() {
  const profile = useQuery(api.profiles.getMine)
  const updateBodyStats = useMutation(api.profiles.updateBodyStats)
  const setDailyVolumeGoal = useMutation(api.profiles.setDailyVolumeGoal)
  const setUnitPreference = useMutation(api.profiles.setUnitPreference)

  // Display units only — heightCm/weightKg are always what gets stored.
  // 'kg' = metric (cm), 'lb' = imperial (ft+in). The conversion itself lives
  // in src/lib/bodyUnits.ts, shared with the onboarding body-stats slide.
  const [units, setUnits] = useState<WeightUnit>('kg')
  const [fields, setFields] = useState<BodyFields>(EMPTY_BODY_FIELDS)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = (key: keyof BodyFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  const [dailyGoal, setDailyGoal] = useState('')
  const [goalSaved, setGoalSaved] = useState(false)
  const [goalError, setGoalError] = useState<string | null>(null)

  // Pull saved values into the form exactly once, the first time they load —
  // otherwise a later reactive refetch (e.g. after saving) would clobber
  // whatever the user is mid-typing.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated || profile === undefined) return
    // Saved values are canonical cm/kg — convert into whichever units this
    // profile prefers to display before they hit the form fields.
    const pref = profile?.unitPreference ?? 'kg'
    setUnits(pref)
    setFields(bodyFieldsFor(pref, { heightCm: profile?.heightCm, weightKg: profile?.weightKg }))
    if (profile?.age) setAge(String(profile.age))
    if (profile?.sex) setSex(profile.sex)
    if (profile?.activityLevel) setActivityLevel(profile.activityLevel)
    if (profile?.dailyVolumeGoalKg) setDailyGoal(String(profile.dailyVolumeGoalKg))
    setHydrated(true)
  }, [profile, hydrated])

  // Convert whatever is currently typed so the numbers don't jump when the
  // toggle flips, then persist the preference.
  function handleUnitsChange(next: WeightUnit) {
    if (next === units) return
    setFields((prev) => convertBodyFields(next, prev))
    setUnits(next)
    void setUnitPreference({ unitPreference: next })
  }

  if (profile === undefined) {
    return (
      <Typography sx={{ mt: 8, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  // Whatever the form shows, these are always cm/kg — the only units that
  // ever reach the backend or the calorie math.
  const { heightCm, weightKg } = canonicalBody(units, fields)
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
        <Box>
          <Typography variant="body2" color="text.secondary">
            Units
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <SegmentedControl
              value={units}
              onChange={handleUnitsChange}
              // No "(cm/kg)" hint here — SegmentedControl capitalizes every
              // word ("Cm/Kg"), and the field labels below already name the
              // units.
              options={[
                { value: 'kg', label: 'Metric' },
                { value: 'lb', label: 'Imperial' },
              ]}
            />
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {units === 'lb' ? 'Height (ft / in)' : 'Height (cm)'}
            </Typography>
            {units === 'lb' ? (
              <Box sx={{ mt: 0.5, display: 'flex', gap: 1 }}>
                <TextField
                  value={fields.heightFt}
                  onChange={(e) => setField('heightFt', e.target.value)}
                  slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Height feet' } }}
                  placeholder="5"
                  fullWidth
                />
                <TextField
                  value={fields.heightIn}
                  onChange={(e) => setField('heightIn', e.target.value)}
                  slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Height inches' } }}
                  placeholder="10"
                  fullWidth
                />
              </Box>
            ) : (
              <TextField
                value={fields.height}
                onChange={(e) => setField('height', e.target.value)}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                placeholder="180"
                fullWidth
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {units === 'lb' ? 'Weight (lb)' : 'Weight (kg)'}
            </Typography>
            <TextField
              value={fields.weight}
              onChange={(e) => setField('weight', e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              placeholder={units === 'lb' ? '175' : '80'}
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

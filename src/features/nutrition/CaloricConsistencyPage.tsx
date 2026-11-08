import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { Box, Button, Collapse, IconButton, Link as MuiLink, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import {
  caloriesFromMacros,
  goalCalories,
  mifflinStJeorBmr,
  resolveCalorieTarget,
  resolveMacroTargets,
  tdee,
} from '../../../convex/fitness'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { NutrientProgress } from './NutrientProgress'
import { FoodSearch } from './FoodSearch'
import { formatServings } from './servings'
import { CalorieTargetDialog } from './CalorieTargetDialog'

type FoodFields = { calories: string; proteinG: string; carbsG: string; fatG: string; fiberG: string }
const EMPTY_FIELDS: FoodFields = { calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' }

// The Nutrition tab. Falls back to `nutritionGoal ?? 'maintain'` when the
// user hasn't picked a goal on the Stats page yet (see StatsPage.tsx:
// handleSelectGoal), so it works fine reached directly from the nav rather
// than only via a goal card. Shows today's food-intake stats against that
// goal, and the ways to log a new item: search the food database and pick a
// number of servings (the main path), or enter a named item by hand (the
// calorie count follows from the macros unless you type your own).
//
// The photo-estimate path (convex/nutrition.ts) has no entry point here until
// it's connected: the backend is intact, only the button was removed.
export function CaloricConsistencyPage() {
  const profile = useQuery(api.profiles.getMine)
  const today = useQuery(api.nutrition.getToday)
  const logManualEntry = useMutation(api.nutrition.logManualEntry)
  const deleteEntry = useMutation(api.nutrition.deleteEntry)

  const [fields, setFields] = useState<FoodFields>(EMPTY_FIELDS)
  const [description, setDescription] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [editingTarget, setEditingTarget] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = (key: keyof FoodFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  // The calories the macros currently add up to — shown under the Calories
  // field as its placeholder, and saved as-is when the user leaves that field
  // blank. `null` until at least one macro is entered, so we don't flash "0".
  const macroCalories = useMemo(() => {
    const p = Number(fields.proteinG)
    const c = Number(fields.carbsG)
    const f = Number(fields.fatG)
    if (!fields.proteinG.trim() && !fields.carbsG.trim() && !fields.fatG.trim()) return null
    if (Number.isNaN(p) || Number.isNaN(c) || Number.isNaN(f)) return null
    return caloriesFromMacros(p || 0, c || 0, f || 0)
  }, [fields.proteinG, fields.carbsG, fields.fatG])

  if (profile === undefined || today === undefined) {
    return (
      <Typography sx={{ mt: 8, textAlign: 'center' }} color="text.secondary">
        Loading…
      </Typography>
    )
  }

  if (
    profile === null ||
    profile.heightCm === null ||
    profile.weightKg === null ||
    profile.age === null ||
    profile.sex === null ||
    profile.activityLevel === null
  ) {
    return (
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Nutrition
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Finish your body stats first — that's what the calorie targets below are based on.
        </Typography>
        <Button component={Link} to="/stats" variant="contained" sx={{ mt: 2 }}>
          Go to My Stats
        </Button>
      </Box>
    )
  }

  const bmr = mifflinStJeorBmr(profile.weightKg, profile.heightCm, profile.age, profile.sex)
  const tdeeValue = tdee(bmr, profile.activityLevel)
  const goal = profile.nutritionGoal ?? 'maintain'
  const targetCalories = resolveCalorieTarget(tdeeValue, goal, profile.calorieTargetOverride)
  const hasCustomTarget = profile.calorieTargetOverride != null
  const targets = resolveMacroTargets(
    targetCalories,
    profile.weightKg,
    goal,
    profile.calorieTargetOverride != null ? profile.macroTargetOverride : null,
  )

  async function handleLogManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (Object.values(fields).every((v) => v.trim() === '')) {
      setError('Enter at least one value')
      return
    }
    setSaving(true)
    try {
      // Calories left blank is intentional — logManualEntry fills it in from
      // the macros (4/4/9). Only send a number when the user typed their own.
      await logManualEntry({
        description: description.trim() || undefined,
        calories: fields.calories.trim() ? Number(fields.calories) : undefined,
        proteinG: fields.proteinG.trim() ? Number(fields.proteinG) : undefined,
        carbsG: fields.carbsG.trim() ? Number(fields.carbsG) : undefined,
        fatG: fields.fatG.trim() ? Number(fields.fatG) : undefined,
        fiberG: fields.fiberG.trim() ? Number(fields.fiberG) : undefined,
      })
      setFields(EMPTY_FIELDS)
      setDescription('')
    } catch (err) {
      setError(errorMessage(err, 'Could not log that.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
        Nutrition
      </Typography>
      <FirstVisitTip tabKey="nutrition" />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Today, against your {goal} goal ·{' '}
        <MuiLink component={Link} to="/stats" color="primary.main">
          Edit stats
        </MuiLink>
      </Typography>

      {/* Only accounts that predate the onboarding goal step can land here
          without one; they're still being measured against "maintain". */}
      {profile.nutritionGoal == null && (
        <GlassTile sx={{ mt: 2, p: 1.5 }}>
          <Typography variant="body2">
            You haven't chosen a goal yet, so these numbers assume you're maintaining.{' '}
            <MuiLink component={Link} to="/stats" color="primary.main">
              Choose your goal
            </MuiLink>
          </Typography>
        </GlassTile>
      )}

      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NutrientProgress
          label="Calories"
          unit="kcal"
          consumed={today.totals.calories}
          target={targetCalories}
          note={hasCustomTarget ? 'Custom target' : undefined}
          onEdit={() => setEditingTarget(true)}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1 }}>
          <NutrientProgress label="Protein" unit="g" consumed={today.totals.proteinG} target={targets.proteinG} />
          <NutrientProgress label="Carbs" unit="g" consumed={today.totals.carbsG} target={targets.carbsG} />
          <NutrientProgress label="Fat" unit="g" consumed={today.totals.fatG} target={targets.fatG} />
          <NutrientProgress label="Fiber" unit="g" consumed={today.totals.fiberG} target={targets.fiberG} />
        </Box>
      </Box>

      {editingTarget && (
        <CalorieTargetDialog
          current={targetCalories}
          currentMacros={profile.macroTargetOverride}
          goal={goal}
          goalCalories={goalCalories(tdeeValue, goal)}
          weightKg={profile.weightKg}
          isCustom={hasCustomTarget}
          onClose={() => setEditingTarget(false)}
        />
      )}

      <Typography variant="h6" sx={{ mt: 4, fontWeight: 'bold' }}>
        Log food
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Search for what you ate. The totals add up for you.
      </Typography>

      <FoodSearch />

      <Box sx={{ mt: 1.5, textAlign: 'center' }}>
        <MuiLink component="button" type="button" onClick={() => setManualOpen((o) => !o)}>
          {manualOpen ? 'Hide manual entry' : "Can't find it? Enter manually"}
        </MuiLink>
      </Box>

      <Collapse in={manualOpen} unmountOnExit>
        <Box component="form" onSubmit={(e) => void handleLogManual(e)} sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            label="Food name"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Homemade stew"
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1.5 }}>
            <TextField
              label="Protein (g)"
              value={fields.proteinG}
              onChange={(e) => setField('proteinG', e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label="Carbs (g)"
              value={fields.carbsG}
              onChange={(e) => setField('carbsG', e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label="Fat (g)"
              value={fields.fatG}
              onChange={(e) => setField('fatG', e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label="Fiber (g)"
              value={fields.fiberG}
              onChange={(e) => setField('fiberG', e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Box>
          <TextField
            label="Calories"
            value={fields.calories}
            onChange={(e) => setField('calories', e.target.value)}
            placeholder={macroCalories !== null ? String(macroCalories) : undefined}
            helperText={
              macroCalories !== null
                ? `≈ ${macroCalories} kcal from the macros above — leave blank to use this`
                : 'Leave blank to total it from protein, carbs and fat'
            }
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}

          <Button type="submit" variant="contained" fullWidth disabled={saving}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
        </Box>
      </Collapse>

      <Typography variant="h6" sx={{ mt: 4, fontWeight: 'bold' }}>
        Today's entries
      </Typography>
      {today.entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Nothing logged yet today.
        </Typography>
      ) : (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {today.entries.map((entry) => (
            <GlassTile
              key={entry._id}
              sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {entry.status === 'pending'
                    ? 'Analyzing…'
                    : entry.status === 'failed'
                      ? 'Could not analyze'
                      : `${entry.description ?? 'Manual entry'}${
                          entry.servings != null && entry.servings !== 1
                            ? ` × ${formatServings(entry.servings)}`
                            : ''
                        }`}
                </Typography>
                {entry.status === 'complete' && (
                  <Typography variant="caption" color="text.secondary">
                    {entry.calories ?? 0} kcal · P {entry.proteinG ?? 0}g · C {entry.carbsG ?? 0}g · F {entry.fatG ?? 0}g
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                aria-label="Remove entry"
                onClick={() => void deleteEntry({ foodLogId: entry._id })}
              >
                <Typography sx={{ fontSize: 18, lineHeight: 1 }} color="text.secondary">
                  ×
                </Typography>
              </IconButton>
            </GlassTile>
          ))}
        </Box>
      )}

    </Box>
  )
}

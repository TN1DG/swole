import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAction, useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { goalCalories, macroTargets, mifflinStJeorBmr, tdee } from '../../../convex/fitness'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { CameraIcon } from '../../components/icons'
import { NutrientProgress } from './NutrientProgress'

type FoodFields = { calories: string; proteinG: string; carbsG: string; fatG: string; fiberG: string }
const EMPTY_FIELDS: FoodFields = { calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' }

// Reached by tapping a goal card on the Stats page (see StatsPage.tsx:
// handleSelectGoal), which saves that goal first. Shows today's food-intake
// stats against it, and the two ways to log a new item: type it in, or snap
// a photo and let a vision model estimate it (convex/nutrition.ts).
export function CaloricConsistencyPage() {
  const profile = useQuery(api.profiles.getMine)
  const today = useQuery(api.nutrition.getToday)
  const logManualEntry = useMutation(api.nutrition.logManualEntry)
  const deleteEntry = useMutation(api.nutrition.deleteEntry)
  const generateUploadUrl = useMutation(api.nutrition.generateFoodPhotoUploadUrl)
  const logPhotoEntry = useMutation(api.nutrition.logPhotoEntry)
  const analyzeFoodPhoto = useAction(api.nutrition.analyzeFoodPhoto)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fields, setFields] = useState<FoodFields>(EMPTY_FIELDS)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setField = (key: keyof FoodFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

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
        <Typography component={Link} to="/stats" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
          ← Stats
        </Typography>
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 'bold' }}>
          Caloric Consistency
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
  const targetCalories = goalCalories(tdeeValue, goal)
  const targets = macroTargets(targetCalories, profile.weightKg, goal)

  async function handleLogManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (Object.values(fields).every((v) => v.trim() === '')) {
      setError('Enter at least one value')
      return
    }
    setSaving(true)
    try {
      await logManualEntry({
        calories: fields.calories.trim() ? Number(fields.calories) : undefined,
        proteinG: fields.proteinG.trim() ? Number(fields.proteinG) : undefined,
        carbsG: fields.carbsG.trim() ? Number(fields.carbsG) : undefined,
        fatG: fields.fatG.trim() ? Number(fields.fatG) : undefined,
        fiberG: fields.fiberG.trim() ? Number(fields.fiberG) : undefined,
      })
      setFields(EMPTY_FIELDS)
    } catch (err) {
      setError(errorMessage(err, 'Could not log that.'))
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    e.target.value = ''
    if (!file) return

    setError(null)
    setAnalyzing(true)
    try {
      const uploadUrl = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) throw new Error('Upload failed — check your connection')
      const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }

      const logged = await logPhotoEntry({ storageId })
      if (!logged.ok) throw new Error(logged.error)

      const analysis = await analyzeFoodPhoto({ foodLogId: logged.foodLogId, storageId })
      setFields({
        calories: String(Math.round(analysis.calories)),
        proteinG: String(Math.round(analysis.proteinG)),
        carbsG: String(Math.round(analysis.carbsG)),
        fatG: String(Math.round(analysis.fatG)),
        fiberG: String(Math.round(analysis.fiberG)),
      })
    } catch (err) {
      setError(errorMessage(err, 'Could not analyze that photo — log it manually instead.'))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Box>
      <Typography component={Link} to="/stats" variant="body2" color="text.secondary" sx={{ textDecoration: 'none' }}>
        ← Stats
      </Typography>
      <Typography variant="h5" sx={{ mt: 1, fontWeight: 'bold' }}>
        Caloric Consistency
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Today, against your {goal} goal.
      </Typography>

      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NutrientProgress label="Calories" unit="kcal" consumed={today.totals.calories} target={targetCalories} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1 }}>
          <NutrientProgress label="Protein" unit="g" consumed={today.totals.proteinG} target={targets.proteinG} />
          <NutrientProgress label="Carbs" unit="g" consumed={today.totals.carbsG} target={targets.carbsG} />
          <NutrientProgress label="Fat" unit="g" consumed={today.totals.fatG} target={targets.fatG} />
          <NutrientProgress label="Fiber" unit="g" consumed={today.totals.fiberG} target={targets.fiberG} />
        </Box>
      </Box>

      <Typography variant="h6" sx={{ mt: 4, fontWeight: 'bold' }}>
        Log food
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Type it in, or snap a photo and let AI estimate it.
      </Typography>

      <Box component="form" onSubmit={(e) => void handleLogManual(e)} sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 1.5 }}>
          <TextField
            label="Calories"
            value={fields.calories}
            onChange={(e) => setField('calories', e.target.value)}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
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

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button type="submit" variant="contained" fullWidth disabled={saving || analyzing}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
          <IconButton
            aria-label="Take a photo of your food"
            disabled={analyzing}
            onClick={() => fileInputRef.current?.click()}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px' }}
          >
            <CameraIcon size={20} />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void handlePhotoChange(e)}
          />
        </Box>
        {analyzing && (
          <Typography variant="body2" color="text.secondary">
            Analyzing photo…
          </Typography>
        )}
      </Box>

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
                      : (entry.description ?? 'Manual entry')}
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

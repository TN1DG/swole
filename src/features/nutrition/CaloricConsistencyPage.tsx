import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAction, useMutation, useQuery } from 'convex/react'
import { Box, Button, IconButton, Link as MuiLink, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  caloriesFromMacros,
  goalCalories,
  macroTargets,
  mifflinStJeorBmr,
  tdee,
} from '../../../convex/fitness'
import { errorMessage } from '../../lib/errors'
import { GlassTile } from '../../components/GlassTile'
import { CameraIcon, SearchIcon } from '../../components/icons'
import { FirstVisitTip } from '../../components/FirstVisitTip'
import { NutrientProgress } from './NutrientProgress'
import { FoodPicker, type PickedFood } from './FoodPicker'

type FoodFields = { calories: string; proteinG: string; carbsG: string; fatG: string; fiberG: string }
const EMPTY_FIELDS: FoodFields = { calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' }

// Re-encodes any browser-decodable image (HEIC included, on platforms whose
// OS codecs the browser defers to — notably iOS Safari) as a JPEG blob.
// `imageOrientation: 'from-image'` bakes in the EXIF rotation phone photos
// carry, since a canvas has no EXIF metadata of its own to preserve it.
// Throws if the browser can't decode the source format at all.
async function toUploadableJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that photo')
    ctx.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that photo'))),
        'image/jpeg',
        0.9,
      )
    })
  } finally {
    bitmap.close()
  }
}

// The Nutrition tab. Falls back to `nutritionGoal ?? 'maintain'` when the
// user hasn't picked a goal on the Stats page yet (see StatsPage.tsx:
// handleSelectGoal), so it works fine reached directly from the nav rather
// than only via a goal card. Shows today's food-intake stats against that
// goal, and the two ways to log a new item: enter the macros (the calorie
// count follows from them unless you type your own), or add a photo and let
// a vision model estimate it (convex/nutrition.ts).
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
  const [description, setDescription] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
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
      // Calories left blank is intentional — logManualEntry fills it in from
      // the macros (4/4/9). Only send a number when the user typed their own.
      await logManualEntry({
        description: description ?? undefined,
        calories: fields.calories.trim() ? Number(fields.calories) : undefined,
        proteinG: fields.proteinG.trim() ? Number(fields.proteinG) : undefined,
        carbsG: fields.carbsG.trim() ? Number(fields.carbsG) : undefined,
        fatG: fields.fatG.trim() ? Number(fields.fatG) : undefined,
        fiberG: fields.fiberG.trim() ? Number(fields.fiberG) : undefined,
      })
      setFields(EMPTY_FIELDS)
      setDescription(null)
    } catch (err) {
      setError(errorMessage(err, 'Could not log that.'))
    } finally {
      setSaving(false)
    }
  }

  // From the FoodPicker: fill the form with the picked food's macros so the
  // user can still tweak the portion before logging, same as an AI estimate.
  function handlePickFood(food: PickedFood) {
    setDescription(food.description)
    setFields({
      calories: String(Math.round(food.calories)),
      proteinG: String(food.proteinG),
      carbsG: String(food.carbsG),
      fatG: String(food.fatG),
      fiberG: String(food.fiberG),
    })
    setPickerOpen(false)
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    e.target.value = ''
    if (!file) return

    setError(null)
    setAnalyzing(true)
    try {
      // Photos picked from a phone's gallery are frequently HEIC/HEIF (the
      // iOS default), which the vision model can't read — only JPEG, PNG,
      // GIF and WEBP. A photo taken through "Take Photo" on the same input
      // usually comes back already normalized to JPEG, which is why this
      // only bites on gallery picks. Re-encoding through a canvas here
      // fixes that, corrects EXIF rotation, and shrinks oversized originals
      // toward the upload cap, regardless of source format.
      let upload: Blob
      try {
        upload = await toUploadableJpeg(file)
      } catch {
        throw new Error("That photo's format isn't supported — try a different one.")
      }

      const uploadUrl = await generateUploadUrl({})
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': upload.type },
        body: upload,
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
        Type in the macros, search the food database, or add a photo and let AI estimate it.
      </Typography>

      <Box component="form" onSubmit={(e) => void handleLogManual(e)} sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {description && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ flex: 1 }} noWrap>
              Logging: <strong>{description}</strong>
            </Typography>
            <MuiLink component="button" type="button" onClick={() => setDescription(null)}>
              Clear
            </MuiLink>
          </Box>
        )}
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

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button type="submit" variant="contained" fullWidth disabled={saving || analyzing}>
            {saving ? 'Logging…' : 'Log'}
          </Button>
          <IconButton
            aria-label="Search the food database"
            disabled={analyzing}
            onClick={() => setPickerOpen(true)}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px' }}
          >
            <SearchIcon size={20} />
          </IconButton>
          <IconButton
            aria-label="Add a photo of your food"
            disabled={analyzing}
            onClick={() => fileInputRef.current?.click()}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px' }}
          >
            <CameraIcon size={20} />
          </IconButton>
          {/* No `capture` attribute: on a phone this lets the user pick "Take
              Photo" or an existing shot from their library, rather than being
              forced straight into the camera. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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

      {pickerOpen && <FoodPicker onPick={handlePickFood} onClose={() => setPickerOpen(false)} />}
    </Box>
  )
}

import { useEffect, useState } from 'react'
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
import { CalorieBreakdown } from '../stats/CalorieBreakdown'
import { FlameIcon, PeopleIcon } from '../../components/icons'
import { errorMessage } from '../../lib/errors'
import {
  canonicalBody,
  convertBodyFields,
  EMPTY_BODY_FIELDS,
  type BodyFields,
} from '../../lib/bodyUnits'
import type { WeightUnit } from '../../lib/weightFormat'
import { SegmentedControl } from '../../components/SegmentedControl'

const STORY_SLIDES = [
  {
    title: 'Built in the gym, not a boardroom.',
    body: "Swole is one lifter's personal project — built to log sets, chase PRs, and stay honest about training. Now it's yours too.",
  },
  {
    title: 'Consistency earns its own trophy case.',
    body: 'Log 2+ weeks in a row and badges start stacking — Consistent, Dedicated, Relentless, Iron Will. Miss a week and the streak resets. No participation trophies.',
  },
  {
    title: 'Lift alone. Compete together.',
    body: "Add friends by username, see who's grinding this week on the leaderboard, peek at their sessions. Nobody trains harder when nobody's watching — so let people watch.",
  },
  {
    title: 'This app is never finished.',
    body: "Every feature so far came from someone actually using it. Got something Swole's missing? There's a direct line to the developer on your Profile page — and it gets read.",
  },
] as const

// index 0-3: story slides. 4: identity. 5: stats questionnaire. 6: reward.
const IDENTITY_STEP = STORY_SLIDES.length
const STATS_STEP = IDENTITY_STEP + 1
const REWARD_STEP = STATS_STEP + 1

export function WelcomeCarousel() {
  const [step, setStep] = useState(0)
  const [bodyStats, setBodyStats] = useState<{
    heightCm: number
    weightKg: number
    age: number
    sex: Sex
    activityLevel: ActivityLevel
  } | null>(null)

  return (
    <Box sx={{ mx: 'auto', display: 'flex', minHeight: '100svh', maxWidth: '32rem', flexDirection: 'column', justifyContent: 'center', px: 3, py: 4 }}>
      {step < IDENTITY_STEP && (
        <StorySlide
          index={step}
          onNext={() => setStep(step + 1)}
          onBack={step > 0 ? () => setStep(step - 1) : undefined}
        />
      )}
      {step === IDENTITY_STEP && <IdentitySlide onNext={() => setStep(step + 1)} />}
      {step === STATS_STEP && (
        <StatsSlide
          onNext={(stats) => {
            setBodyStats(stats)
            setStep(step + 1)
          }}
        />
      )}
      {step === REWARD_STEP && bodyStats && <RewardSlide stats={bodyStats} />}

      {step < IDENTITY_STEP && (
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 1 }}>
          {STORY_SLIDES.map((_, i) => (
            <Box
              key={i}
              sx={{ height: 6, width: 24, borderRadius: '9999px', bgcolor: i === step ? 'primary.main' : 'surface2.main' }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function StorySlide({
  index,
  onNext,
  onBack,
}: {
  index: number
  onNext: () => void
  onBack?: () => void
}) {
  const slide = STORY_SLIDES[index]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
        {slide.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 2 }}>
        {slide.body}
      </Typography>
      <Button variant="contained" fullWidth sx={{ mt: 4 }} onClick={onNext}>
        {index === STORY_SLIDES.length - 1 ? "Let's set you up" : 'Next'}
      </Button>
      {onBack && (
        <Button variant="text" color="inherit" sx={{ mt: 1.5, textDecoration: 'underline', color: 'text.secondary' }} onClick={onBack}>
          Back
        </Button>
      )}
    </Box>
  )
}

function IdentitySlide({ onNext }: { onNext: () => void }) {
  const profile = useQuery(api.profiles.getMine)
  const saveIdentity = useMutation(api.profiles.saveOnboardingIdentity)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Pre-fill once profile data arrives — handles the retroactive-onboarding
  // gap gracefully (an already-active tester who somehow lands here still
  // just confirms and taps through instead of starting from blank fields).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hydrated || profile === undefined) return
    if (profile?.displayName) setDisplayName(profile.displayName)
    if (profile?.username) setUsername(profile.username)
    setHydrated(true)
  }, [profile, hydrated])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await saveIdentity({ username, displayName })
      onNext()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <PeopleIcon size={32} color="var(--color-muted)" />
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 900, letterSpacing: '-0.02em' }}>
          How should friends find you?
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Your name and a username — both changeable later.
        </Typography>
      </Box>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box>
          <TextField
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            required
            fullWidth
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
            Up to 40 characters.
          </Typography>
        </Box>
        <Box>
          <TextField
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            required
            fullWidth
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
            3-20 characters — lowercase letters, numbers, and underscores only. Must be unique.
          </Typography>
        </Box>
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 0.5 }}>
          {submitting ? 'One sec…' : 'Continue'}
        </Button>
      </Box>
    </Box>
  )
}

function StatsSlide({
  onNext,
}: {
  onNext: (stats: {
    heightCm: number
    weightKg: number
    age: number
    sex: Sex
    activityLevel: ActivityLevel
  }) => void
}) {
  const updateBodyStats = useMutation(api.profiles.updateBodyStats)
  const setUnitPreference = useMutation(api.profiles.setUnitPreference)
  // Display units only — cm/kg is what actually gets stored, whichever of
  // these is selected. Defaults to metric, matching the schema default.
  const [units, setUnits] = useState<WeightUnit>('kg')
  const [fields, setFields] = useState<BodyFields>(EMPTY_BODY_FIELDS)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const setField = (key: keyof BodyFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }))

  // Carry whatever is already typed across to the new unit, then remember the
  // choice: someone who says "pounds" here should not have to say it a second
  // time on the Stats page before the rest of the app believes them.
  function handleUnitsChange(next: WeightUnit) {
    if (next === units) return
    setFields((prev) => convertBodyFields(next, prev))
    setUnits(next)
    void setUnitPreference({ unitPreference: next })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const { heightCm, weightKg } = canonicalBody(units, fields)
    const ageYears = parseInt(age, 10)
    setSubmitting(true)
    try {
      await updateBodyStats({ heightCm, weightKg, age: ageYears, sex, activityLevel })
      onNext({ heightCm, weightKg, age: ageYears, sex, activityLevel })
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <FlameIcon size={32} color="var(--color-muted)" />
        <Typography variant="h5" sx={{ mt: 1, fontWeight: 900, letterSpacing: '-0.02em' }}>
          What's your body working with?
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          So we can show you your calorie and macro numbers.
        </Typography>
      </Box>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <SegmentedControl
          value={units}
          onChange={handleUnitsChange}
          options={[
            { value: 'kg', label: 'Metric' },
            { value: 'lb', label: 'Imperial' },
          ]}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          {units === 'lb' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <TextField
                value={fields.heightFt}
                onChange={(e) => setField('heightFt', e.target.value)}
                required
                placeholder="Height (ft)"
                fullWidth
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
              <TextField
                value={fields.heightIn}
                onChange={(e) => setField('heightIn', e.target.value)}
                placeholder="in"
                fullWidth
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </Box>
          ) : (
            <TextField
              value={fields.height}
              onChange={(e) => setField('height', e.target.value)}
              required
              placeholder="Height (cm)"
              fullWidth
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          )}
          <TextField
            value={fields.weight}
            onChange={(e) => setField('weight', e.target.value)}
            required
            placeholder={units === 'lb' ? 'Weight (lb)' : 'Weight (kg)'}
            fullWidth
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          />
        </Box>
        <TextField
          value={age}
          onChange={(e) => setAge(e.target.value)}
          required
          placeholder="Age"
          fullWidth
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <SegmentedControl
          value={sex}
          onChange={setSex}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
        <Select
          value={activityLevel}
          onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
          fullWidth
          inputProps={{ 'aria-label': 'Activity level' }}
        >
          {ACTIVITY_LEVELS.map((level) => (
            <MenuItem key={level.value} value={level.value}>
              {level.label} — {level.hint}
            </MenuItem>
          ))}
        </Select>

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 0.5 }}>
          {submitting ? 'One sec…' : 'See my numbers'}
        </Button>
      </Box>
    </Box>
  )
}

function RewardSlide({
  stats,
}: {
  stats: { heightCm: number; weightKg: number; age: number; sex: Sex; activityLevel: ActivityLevel }
}) {
  const finishOnboarding = useMutation(api.profiles.finishOnboarding)
  const [submitting, setSubmitting] = useState(false)

  const bmr = mifflinStJeorBmr(stats.weightKg, stats.heightCm, stats.age, stats.sex)
  const tdeeValue = tdee(bmr, stats.activityLevel)

  async function handleFinish() {
    setSubmitting(true)
    try {
      await finishOnboarding({})
      // Success flips profile.onboarded -> OnboardingGate swaps to the app.
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
          Here's what your body needs.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Based on what you just entered — revisit anytime from Profile → My Stats.
        </Typography>
      </Box>
      <Box sx={{ mt: 3 }}>
        <CalorieBreakdown bmr={bmr} tdeeValue={tdeeValue} weightKg={stats.weightKg} />
      </Box>
      <Button variant="contained" fullWidth disabled={submitting} sx={{ mt: 3 }} onClick={() => void handleFinish()}>
        {submitting ? 'One sec…' : "Let's Lift 💪"}
      </Button>
    </Box>
  )
}

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
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
    <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-8">
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
        <div className="mt-8 flex justify-center gap-2">
          {STORY_SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? 'bg-accent' : 'bg-surface-2'}`}
            />
          ))}
        </div>
      )}
    </div>
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
    <div className="flex flex-col items-center text-center">
      <h1 className="text-2xl font-black tracking-tight">{slide.title}</h1>
      <p className="mt-4 text-muted">{slide.body}</p>
      <button
        type="button"
        onClick={onNext}
        className="btn-glow mt-8 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
      >
        {index === STORY_SLIDES.length - 1 ? "Let's set you up" : 'Next'}
      </button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-sm text-muted underline underline-offset-4"
        >
          Back
        </button>
      )}
    </div>
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
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <PeopleIcon className="h-8 w-8 text-muted" />
        <h1 className="mt-2 text-2xl font-black tracking-tight">How should friends find you?</h1>
        <p className="mt-2 text-muted">Your name and a username — both changeable later.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          required
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          required
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
        >
          {submitting ? 'One sec…' : 'Continue'}
        </button>
      </form>
    </div>
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
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const heightCm = parseFloat(height)
    const weightKg = parseFloat(weight)
    const ageYears = parseInt(age, 10)
    setSubmitting(true)
    try {
      await updateBodyStats({ heightCm, weightKg, age: ageYears, sex, activityLevel })
      onNext({ heightCm, weightKg, age: ageYears, sex, activityLevel })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <FlameIcon className="h-8 w-8 text-muted" />
        <h1 className="mt-2 text-2xl font-black tracking-tight">What's your body working with?</h1>
        <p className="mt-2 text-muted">So we can show you your calorie and macro numbers.</p>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            inputMode="decimal"
            required
            placeholder="Height (cm)"
            className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
          />
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="decimal"
            required
            placeholder="Weight (kg)"
            className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
          />
        </div>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          inputMode="numeric"
          required
          placeholder="Age"
          className="rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <div className="grid grid-cols-2 rounded-xl glass-tile p-1">
          {(['male', 'female'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`rounded-lg py-2 text-sm font-semibold capitalize ${
                sex === s ? 'bg-accent text-accent-fg' : 'text-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={activityLevel}
          onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-text outline-none focus:border-accent"
        >
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label} — {level.hint}
            </option>
          ))}
        </select>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="btn-glow mt-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
        >
          {submitting ? 'One sec…' : 'See my numbers'}
        </button>
      </form>
    </div>
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
    <div>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-black tracking-tight">Here's what your body needs.</h1>
        <p className="mt-2 text-muted">
          Based on what you just entered — revisit anytime from Profile → My Stats.
        </p>
      </div>
      <div className="mt-6">
        <CalorieBreakdown bmr={bmr} tdeeValue={tdeeValue} weightKg={stats.weightKg} />
      </div>
      <button
        type="button"
        onClick={() => void handleFinish()}
        disabled={submitting}
        className="btn-glow mt-6 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
      >
        {submitting ? 'One sec…' : "Let's Lift 💪"}
      </button>
    </div>
  )
}

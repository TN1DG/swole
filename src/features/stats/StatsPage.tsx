import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  ACTIVITY_LEVELS,
  GOALS,
  goalCalories,
  macroTargets,
  mifflinStJeorBmr,
  tdee,
  type ActivityLevel,
  type Sex,
} from '../../../convex/fitness'
import { FlameIcon } from '../../components/icons'

export function StatsPage() {
  const profile = useQuery(api.profiles.getMine)
  const updateBodyStats = useMutation(api.profiles.updateBodyStats)

  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setHydrated(true)
  }, [profile, hydrated])

  if (profile === undefined) {
    return <p className="mt-8 text-center text-muted">Loading…</p>
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
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <div>
      <Link to="/profile" className="text-sm text-muted">
        ← Profile
      </Link>
      <h1 className="mt-2 text-2xl font-bold">My Stats</h1>
      <p className="mt-1 text-sm text-muted">
        Used to estimate your daily calorie needs — nothing here is shared.
      </p>

      <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-muted">
            Height (cm)
            <input
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              inputMode="decimal"
              placeholder="180"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm text-muted">
            Weight (kg)
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              inputMode="decimal"
              placeholder="80"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-text outline-none focus:border-accent"
            />
          </label>
        </div>

        <label className="text-sm text-muted">
          Age
          <input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="numeric"
            placeholder="30"
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          />
        </label>

        <div>
          <p className="text-sm text-muted">Sex (used for the calorie formula)</p>
          <div className="mt-1 grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
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
        </div>

        <label className="text-sm text-muted">
          Activity level
          <select
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-text outline-none focus:border-accent"
          >
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label} — {level.hint}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-success">Saved.</p>}

        <button
          type="submit"
          className="mt-1 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
        >
          Save
        </button>
      </form>

      {tdeeValue !== null && bmr !== null ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted uppercase">BMR</p>
              <p className="mt-1 text-lg font-bold">{Math.round(bmr)} kcal</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="flex items-center gap-1 text-xs text-muted uppercase">
                <FlameIcon className="h-3.5 w-3.5" /> TDEE
              </p>
              <p className="mt-1 text-lg font-bold">{Math.round(tdeeValue)} kcal</p>
            </div>
          </div>

          <h2 className="mt-6 text-sm font-semibold tracking-wide text-muted uppercase">
            Calorie & Macro Goals
          </h2>
          <div className="mt-2 flex flex-col gap-3">
            {GOALS.map((goal) => {
              const calories = goalCalories(tdeeValue, goal.value)
              const macros = macroTargets(calories, weightKg, goal.value)
              return (
                <div
                  key={goal.value}
                  className="rounded-2xl border border-border bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <p className="font-semibold">{goal.label}</p>
                    <p className="flex items-center gap-1 font-bold text-accent">
                      <FlameIcon className="h-4 w-4" /> {macros.calories} kcal
                    </p>
                  </div>
                  <p className="text-sm text-muted">{goal.hint}</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                    <Macro label="Protein" value={macros.proteinG} />
                    <Macro label="Carbs" value={macros.carbsG} />
                    <Macro label="Fat" value={macros.fatG} />
                    <Macro label="Fiber" value={macros.fiberG} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="mt-6 text-center text-sm text-muted">
          Fill in height, weight, and age above to see your calorie and macro goals.
        </p>
      )}
    </div>
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <p className="text-[10px] text-muted uppercase">{label}</p>
      <p className="font-bold">{value}g</p>
    </div>
  )
}

import { GOALS, goalCalories, macroTargets } from '../../../convex/fitness'
import { FlameIcon } from '../../components/icons'

// BMR/TDEE tiles + per-goal calorie & macro cards — shared by the My Stats
// page (after saving) and the onboarding reward screen (right after the
// first-run questionnaire), so the numbers and their presentation can never
// drift between the two.
export function CalorieBreakdown({
  bmr,
  tdeeValue,
  weightKg,
}: {
  bmr: number
  tdeeValue: number
  weightKg: number
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl glass-tile p-3">
          <p className="label-micro">BMR</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{Math.round(bmr)} kcal</p>
        </div>
        <div className="rounded-xl glass-tile p-3">
          <p className="label-micro flex items-center gap-1">
            <FlameIcon className="h-3.5 w-3.5" /> TDEE
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">{Math.round(tdeeValue)} kcal</p>
        </div>
      </div>

      <h2 className="label-micro mt-6">Calorie & Macro Goals</h2>
      <div className="mt-2 flex flex-col gap-3">
        {GOALS.map((goal) => {
          const calories = goalCalories(tdeeValue, goal.value)
          const macros = macroTargets(calories, weightKg, goal.value)
          return (
            <div key={goal.value} className="rounded-2xl glass-tile p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">{goal.label}</p>
                <p className="flex items-center gap-1 font-bold text-accent tabular-nums">
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
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <p className="text-[10px] text-muted uppercase">{label}</p>
      <p className="font-bold tabular-nums">{value}g</p>
    </div>
  )
}

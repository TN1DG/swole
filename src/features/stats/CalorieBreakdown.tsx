import { Box, Typography } from '@mui/material'
import { GOALS, goalCalories, macroTargets } from '../../../convex/fitness'
import { FlameIcon } from '../../components/icons'
import { GlassTile } from '../../components/GlassTile'

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
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
        <GlassTile sx={{ p: 1.5 }}>
          <Typography variant="overline" color="text.secondary" component="p">
            BMR
          </Typography>
          <Typography sx={{ mt: 0.5, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }} variant="h6">
            {Math.round(bmr)} kcal
          </Typography>
        </GlassTile>
        <GlassTile sx={{ p: 1.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            component="p"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <FlameIcon size={14} /> TDEE
          </Typography>
          <Typography sx={{ mt: 0.5, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }} variant="h6">
            {Math.round(tdeeValue)} kcal
          </Typography>
        </GlassTile>
      </Box>

      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mt: 3 }}>
        Calorie & Macro Goals
      </Typography>
      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {GOALS.map((goal) => {
          const calories = goalCalories(tdeeValue, goal.value)
          const macros = macroTargets(calories, weightKg, goal.value)
          return (
            <GlassTile key={goal.value} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Typography sx={{ fontWeight: 600 }}>{goal.label}</Typography>
                <Typography
                  color="primary.main"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontWeight: 'bold',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <FlameIcon /> {macros.calories} kcal
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {goal.hint}
              </Typography>
              {/* auto-fit rather than a hard 4 columns: at 4 across on a
                  narrow phone each cell is ~42px of content, which clips
                  "Protein". This keeps one row where it fits and drops to
                  2×2 where it doesn't. */}
              <Box
                sx={{
                  mt: 1.5,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))',
                  gap: 1,
                  textAlign: 'center',
                }}
              >
                <Macro label="Protein" value={macros.proteinG} />
                <Macro label="Carbs" value={macros.carbsG} />
                <Macro label="Fat" value={macros.fatG} />
                <Macro label="Fiber" value={macros.fiberG} />
              </Box>
            </GlassTile>
          )
        })}
      </Box>
    </>
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ borderRadius: '8px', bgcolor: 'surface2.main', p: 1 }}>
      <Typography sx={{ fontSize: '10px', textTransform: 'uppercase' }} color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{value}g</Typography>
    </Box>
  )
}

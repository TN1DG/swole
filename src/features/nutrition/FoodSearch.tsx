import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Box, Button, ButtonBase, Chip, IconButton, TextField, Typography } from '@mui/material'
import { api } from '../../../convex/_generated/api'
import { LIMITS } from '../../../convex/validation'
import { GlassTile } from '../../components/GlassTile'
import { errorMessage } from '../../lib/errors'
import { formatServings } from './servings'

type Food = FunctionReturnType<typeof api.foods.list>[number]

const MAX_RESULTS = 20
const STEP = 0.5
const QUICK_SERVINGS = [0.5, 1, 1.5, 2]

// Same rounding the backend applies (nutrition.ts:logFood), so the preview is
// exactly what gets logged.
const scale = (n: number, servings: number) => Math.round(n * servings * 10) / 10

function macroLine(food: Pick<Food, 'calories' | 'proteinG' | 'carbsG' | 'fatG'>, servings = 1) {
  return `${Math.round(food.calories * servings)} kcal · P ${scale(food.proteinG, servings)}g · C ${scale(food.carbsG, servings)}g · F ${scale(food.fatG, servings)}g`
}

// The Nutrition page's main way to log: find what you ate, say how much, add
// it. Searches the seeded food database (convex/foods.ts) on the client — it's
// a few hundred rows, already loaded once.
export function FoodSearch() {
  const foods = useQuery(api.foods.list)
  const logFood = useMutation(api.nutrition.logFood)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Food | null>(null)
  const [servings, setServings] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term || !foods) return []
    return foods.filter((f) => f.name.toLowerCase().includes(term)).slice(0, MAX_RESULTS)
  }, [foods, search])

  function choose(food: Food) {
    setSelected(food)
    setServings(1)
    setError(null)
  }

  async function add() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await logFood({ foodId: selected._id, servings })
      setSelected(null)
      setSearch('')
    } catch (err) {
      setError(errorMessage(err, 'Could not add that food.'))
    } finally {
      setSaving(false)
    }
  }

  if (selected) {
    return (
      <GlassTile sx={{ mt: 1.5, p: 2, borderColor: 'rgb(var(--color-accent-rgb) / 0.4)' }}>
        <Typography sx={{ fontWeight: 600 }}>{selected.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          Per serving: {macroLine(selected)}
        </Typography>

        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <IconButton
            aria-label="Fewer servings"
            disabled={servings <= STEP}
            onClick={() => setServings((s) => Math.max(STEP, s - STEP))}
            sx={{ border: '1px solid', borderColor: 'divider', width: 44, height: 44 }}
          >
            −
          </IconButton>
          <Box sx={{ textAlign: 'center', minWidth: 80 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }} aria-label="Servings">
              {formatServings(servings)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {servings === 1 ? 'serving' : 'servings'}
            </Typography>
          </Box>
          <IconButton
            aria-label="More servings"
            disabled={servings >= LIMITS.foodServingsMax}
            onClick={() => setServings((s) => Math.min(LIMITS.foodServingsMax, s + STEP))}
            sx={{ border: '1px solid', borderColor: 'divider', width: 44, height: 44 }}
          >
            +
          </IconButton>
        </Box>

        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
          {QUICK_SERVINGS.map((n) => (
            <Chip
              key={n}
              label={formatServings(n)}
              color={servings === n ? 'primary' : 'default'}
              variant={servings === n ? 'filled' : 'outlined'}
              onClick={() => setServings(n)}
            />
          ))}
        </Box>

        <Typography sx={{ mt: 2, textAlign: 'center', fontWeight: 600 }} data-testid="servings-preview">
          {macroLine(selected, servings)}
        </Typography>

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1, textAlign: 'center' }}>
            {error}
          </Typography>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <Button variant="outlined" color="inherit" onClick={() => setSelected(null)} sx={{ flexShrink: 0 }}>
            Back
          </Button>
          <Button variant="contained" fullWidth disabled={saving} onClick={() => void add()}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </Box>
      </GlassTile>
    )
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <TextField
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search foods, e.g. banana, rice, chicken"
        fullWidth
        slotProps={{ htmlInput: { 'aria-label': 'Search foods' } }}
      />
      {search.trim() && foods !== undefined && (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {matches.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
              No match. Use “Enter manually” below.
            </Typography>
          ) : (
            matches.map((food) => (
              <ButtonBase
                key={food._id}
                onClick={() => choose(food)}
                sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: '12px' }}
              >
                <GlassTile sx={{ p: 1.25 }}>
                  <Typography noWrap sx={{ fontWeight: 500 }}>
                    {food.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {macroLine(food)}
                  </Typography>
                </GlassTile>
              </ButtonBase>
            ))
          )}
        </Box>
      )}
    </Box>
  )
}

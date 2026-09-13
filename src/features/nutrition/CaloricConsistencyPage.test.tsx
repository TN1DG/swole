import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'

// Same "answer by function name" shape as ActiveWorkout.test.tsx, extended to
// mutations/actions too: this page calls four of them (logManualEntry,
// deleteEntry, generateFoodPhotoUploadUrl via logPhotoEntry, analyzeFoodPhoto)
// and the assertions below need to tell which one a given call landed on.
const state = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
  mutations: new Map<string, ReturnType<typeof import('vitest').vi.fn>>(),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  const { vi: vitest } = await import('vitest')
  function mutationFor(ref: Parameters<typeof name>[0]) {
    const key = name(ref)
    if (!state.mutations.has(key)) state.mutations.set(key, vitest.fn(() => Promise.resolve()))
    return state.mutations.get(key)
  }
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: mutationFor,
    useAction: mutationFor,
  }
})

const { CaloricConsistencyPage } = await import('./CaloricConsistencyPage')

const COMPLETE_PROFILE = {
  heightCm: 178,
  weightKg: 80,
  age: 30,
  sex: 'male' as const,
  activityLevel: 'moderate' as const,
  nutritionGoal: 'cut' as const,
}

const EMPTY_TODAY = {
  entries: [],
  totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
}

function setToday(today: typeof EMPTY_TODAY) {
  state.queries.set(getFunctionName(api.nutrition.getToday), today)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CaloricConsistencyPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.queries.clear()
  state.mutations.clear()
  vi.clearAllMocks()
  setToday(EMPTY_TODAY)
})

describe('CaloricConsistencyPage — incomplete profile', () => {
  it('gates on body stats before showing any targets', () => {
    state.queries.set(getFunctionName(api.profiles.getMine), {
      ...COMPLETE_PROFILE,
      heightCm: null,
    })
    renderPage()

    expect(screen.getByText(/Finish your body stats first/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to My Stats' })).toBeInTheDocument()
  })
})

describe('CaloricConsistencyPage — targets', () => {
  it("shows today's totals against the saved goal", () => {
    state.queries.set(getFunctionName(api.profiles.getMine), COMPLETE_PROFILE)
    renderPage()

    expect(screen.getByText(/Today, against your cut goal/)).toBeInTheDocument()
  })

  // profiles.nutritionGoal is only set once a goal card on Stats is tapped,
  // so a profile with complete body stats but no goal yet must still render
  // usable targets rather than crashing on a null goal.
  it('falls back to "maintain" when no goal has been picked yet', () => {
    state.queries.set(getFunctionName(api.profiles.getMine), {
      ...COMPLETE_PROFILE,
      nutritionGoal: null,
    })
    renderPage()

    expect(screen.getByText(/Today, against your maintain goal/)).toBeInTheDocument()
  })
})

describe('CaloricConsistencyPage — log food', () => {
  beforeEach(() => {
    state.queries.set(getFunctionName(api.profiles.getMine), COMPLETE_PROFILE)
  })

  it('previews the calorie total from macros as the Calories placeholder', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Protein (g)'), '40')
    await user.type(screen.getByLabelText('Carbs (g)'), '50')
    await user.type(screen.getByLabelText('Fat (g)'), '20')

    // 40*4 + 50*4 + 20*9 = 540 — same 4/4/9 split as caloriesFromMacros.
    expect(screen.getByText(/≈ 540 kcal from the macros above/)).toBeInTheDocument()
  })

  it('logs a manual entry, leaving calories blank so the backend derives it', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Protein (g)'), '40')
    await user.click(screen.getByRole('button', { name: 'Log' }))

    expect(state.mutations.get(getFunctionName(api.nutrition.logManualEntry))).toHaveBeenCalledWith(
      expect.objectContaining({ proteinG: 40, calories: undefined }),
    )
  })

  it('fills the form from a picked food and logs it with its name as the description', async () => {
    state.queries.set(getFunctionName(api.foods.list), [
      {
        _id: 'food1',
        name: 'Banana',
        category: 'Fruit',
        calories: 105,
        proteinG: 1.3,
        carbsG: 27,
        fatG: 0.4,
        fiberG: 3.1,
      },
    ])
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Search the food database' }))
    await user.click(screen.getByText('Banana'))

    expect(screen.getByLabelText('Protein (g)')).toHaveValue('1.3')
    expect(screen.getByText(/Logging:/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Log' }))

    expect(state.mutations.get(getFunctionName(api.nutrition.logManualEntry))).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Banana', proteinG: 1.3 }),
    )
  })

  it('deletes an entry', async () => {
    setToday({
      entries: [
        {
          _id: 'log1',
          loggedAt: Date.now(),
          source: 'manual',
          status: 'complete',
          description: null,
          calories: 200,
          proteinG: 10,
          carbsG: 20,
          fatG: 5,
          fiberG: null,
        },
      ],
      totals: { calories: 200, proteinG: 10, carbsG: 20, fatG: 5, fiberG: 0 },
    } as never)
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Remove entry' }))

    expect(state.mutations.get(getFunctionName(api.nutrition.deleteEntry))).toHaveBeenCalledWith({
      foodLogId: 'log1',
    })
  })
})

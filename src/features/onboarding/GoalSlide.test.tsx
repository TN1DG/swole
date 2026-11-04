import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) =>
      name(ref) === 'profiles:getMine' ? { unitPreference: 'kg' } : undefined,
    useMutation: (ref: Parameters<typeof name>[0]) => (args: unknown) => {
      state.calls.push({ name: name(ref), args })
      return Promise.resolve()
    },
  }
})

const { GoalSlide } = await import('./WelcomeCarousel')

const STATS = {
  heightCm: 178,
  weightKg: 80,
  age: 30,
  sex: 'male' as const,
  activityLevel: 'moderate' as const,
}
const GOAL = getFunctionName(api.profiles.setNutritionGoal)
const TARGET = getFunctionName(api.profiles.setCalorieTarget)
const FINISH = getFunctionName(api.profiles.finishOnboarding)

beforeEach(() => {
  state.calls.length = 0
})

describe('GoalSlide', () => {
  it("won't finish until a goal is chosen", () => {
    render(<GoalSlide stats={STATS} />)
    expect(screen.getByRole('button', { name: 'Choose a goal to continue' })).toBeDisabled()
  })

  it('saves the chosen goal, then finishes onboarding', async () => {
    render(<GoalSlide stats={STATS} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^Cut/ }))
    await user.click(screen.getByRole('button', { name: /Let's Lift/ }))

    expect(state.calls).toEqual([
      { name: GOAL, args: { goal: 'cut' } },
      { name: FINISH, args: {} },
    ])
  })

  // Order matters: choosing a goal clears any custom target on the server.
  it('sets a custom target after the goal', async () => {
    render(<GoalSlide stats={STATS} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^Bulk/ }))
    await user.click(screen.getByRole('button', { name: 'Set my own calories' }))
    await user.type(screen.getByLabelText('My daily calories'), '3100')
    await user.click(screen.getByRole('button', { name: /Let's Lift/ }))

    expect(state.calls.map((c) => c.name)).toEqual([GOAL, TARGET, FINISH])
    expect(state.calls[1]!.args).toEqual({ calories: 3100 })
  })

  it('catches a bad custom target before saving anything', async () => {
    render(<GoalSlide stats={STATS} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^Bulk/ }))
    await user.click(screen.getByRole('button', { name: 'Set my own calories' }))
    await user.type(screen.getByLabelText('My daily calories'), '50')
    await user.click(screen.getByRole('button', { name: /Let's Lift/ }))

    expect(screen.getByText(/between 1000 and 10000/)).toBeInTheDocument()
    expect(state.calls).toEqual([])
  })

  it('cautions about a very low custom target without blocking it', async () => {
    render(<GoalSlide stats={STATS} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Set my own calories' }))
    await user.type(screen.getByLabelText('My daily calories'), '1100')

    expect(screen.getByText(/hard to sustain safely/)).toBeInTheDocument()
  })
})

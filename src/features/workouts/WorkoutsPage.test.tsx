import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'

const state = vi.hoisted(() => ({ queries: new Map<string, unknown>() }))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: () => vi.fn(() => Promise.resolve()),
  }
})

// The summary card is what's under test, not the logging screen or its
// neighbours: stand-ins keep this test to the page's own wiring.
const SUMMARY = {
  discarded: false as const,
  workoutId: 'w42',
  prCount: 1,
  totalVolumeKg: 320,
  completedSetCount: 2,
  exerciseCount: 1,
  durationMs: 94_000,
}
vi.mock('./ActiveWorkout', () => ({
  ActiveWorkout: ({ onFinished }: { onFinished: (s: typeof SUMMARY) => void }) => (
    <button onClick={() => onFinished(SUMMARY)}>finish</button>
  ),
}))
vi.mock('./WorkoutFeedbackPrompt', () => ({ WorkoutFeedbackPrompt: () => null }))
vi.mock('../../components/FirstVisitTip', () => ({ FirstVisitTip: () => null }))

const { WorkoutsPage } = await import('./WorkoutsPage')

beforeEach(() => {
  state.queries.clear()
  state.queries.set(getFunctionName(api.profiles.getMine), { unitPreference: 'kg' })
  state.queries.set(getFunctionName(api.routines.list), [])
})

describe('WorkoutsPage finish summary', () => {
  it('offers Share to Feed and Share as Photo straight after finishing', async () => {
    state.queries.set(getFunctionName(api.workouts.getActive), { _id: 'w42' })
    // A fresh element each time: re-rendering the same object is a no-op.
    const ui = () => (
      <MemoryRouter>
        <WorkoutsPage />
      </MemoryRouter>
    )
    const { rerender } = render(ui())

    await userEvent.click(screen.getByRole('button', { name: 'finish' }))
    // finish ends the workout, so the live query stops returning it.
    state.queries.set(getFunctionName(api.workouts.getActive), null)
    rerender(ui())

    expect(screen.getByText(/Workout saved!/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Share to Feed' })).toHaveAttribute('href', '/feed/compose/w42')
    expect(screen.getByRole('link', { name: /Share as Photo/ })).toHaveAttribute('href', '/share/w42')
  })
})

import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'

// Same "answer useQuery by function name" shape as ActiveWorkout.test.tsx.
// LibraryPage itself is router-only (no Convex calls), but both tabs it
// renders do, so a real render needs all of their queries stubbed too.
const state = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
  mutation: vi.fn(() => Promise.resolve()),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: () => state.mutation,
    useAction: () => state.mutation,
  }
})

const { LibraryPage } = await import('./LibraryPage')

function renderLibrary(initialPath = '/library') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/library" element={<LibraryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.queries.clear()
  vi.clearAllMocks()
  state.queries.set(getFunctionName(api.routines.list), [])
  state.queries.set(getFunctionName(api.exercises.list), [])
  state.queries.set(getFunctionName(api.prs.listMine), [])
  state.queries.set(getFunctionName(api.favorites.myFavoriteIds), [])
  state.queries.set(getFunctionName(api.profiles.getSeenTips), [])
})

// Routines and Exercises used to be separate bottom-nav tabs, each its own
// route; this page merged them behind a segmented control so `/library`
// covers both, and `/routines`/`/exercises`/`/favorites` now redirect here
// (see src/App.tsx). These tests cover the merge, not either tab's own
// behavior — RoutinesTab/ExercisesTab logic is unchanged and untested here.
describe('LibraryPage', () => {
  it('defaults to the Routines tab', () => {
    renderLibrary()
    expect(screen.getByRole('button', { name: 'Routines', pressed: true })).toBeInTheDocument()
    expect(screen.getByText(/No routines yet/)).toBeInTheDocument()
  })

  it('switches to Exercises on tap', async () => {
    renderLibrary()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Exercises' }))

    expect(screen.getByPlaceholderText('Search exercises…')).toBeInTheDocument()
    expect(screen.queryByText(/No routines yet/)).not.toBeInTheDocument()
  })

  it('deep-links to the Exercises tab via ?tab=exercises', () => {
    renderLibrary('/library?tab=exercises')
    expect(screen.getByRole('button', { name: 'Exercises', pressed: true })).toBeInTheDocument()
  })

  // What /favorites now redirects to (App.tsx) — the old dedicated favorites
  // route has to land on the exercises tab with the filter already applied,
  // not just on the library page.
  it('deep-links to Exercises with the favorites filter pre-applied via ?tab=exercises&favorites=1', () => {
    renderLibrary('/library?tab=exercises&favorites=1')
    expect(
      screen.getByText(/No favorites yet — tap the heart on an exercise to pin it here/),
    ).toBeInTheDocument()
  })

  // A bare ?favorites=1 with no explicit tab (not a link this app generates
  // itself, but a plausible bookmarked/typed URL) should not silently apply
  // the favorites filter to a tab it doesn't belong to.
  it('ignores the favorites param on the Routines tab', () => {
    renderLibrary('/library?favorites=1')
    expect(screen.getByRole('button', { name: 'Routines', pressed: true })).toBeInTheDocument()
  })
})

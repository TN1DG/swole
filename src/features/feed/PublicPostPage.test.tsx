import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ post: undefined as unknown, args: [] as unknown[] }))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0], args: unknown) => {
      if (name(ref) !== 'feed:publicPost') return undefined // signed out: no profile
      state.args.push(args)
      return state.post
    },
  }
})
vi.mock('../auth/SignInPage', () => ({
  SignInPage: ({ initialStep }: { initialStep?: string }) => <div>sign-in:{initialStep}</div>,
}))

const { PublicPostPage } = await import('./PublicPostPage')

const POST = {
  _id: 'p1',
  createdAt: Date.UTC(2026, 10, 9, 18),
  caption: 'New bench PB',
  repostedBy: null,
  author: { displayName: 'Sam', username: 'sam', avatarUrl: null },
  photoUrl: null,
  photoWidth: null,
  photoHeight: null,
  workoutName: 'Push Day',
  workoutStartedAt: Date.UTC(2026, 10, 9, 17),
  durationMs: 3_600_000,
  volumeKg: 5000,
  setCount: 12,
  prCount: 1,
  exerciseNames: ['Bench Press', 'Dips'],
  likeCount: 3,
  commentCount: 2,
}

function renderAt(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/p/${id}`]}>
      <Routes>
        <Route path="/p/:postId" element={<PublicPostPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.post = undefined
  state.args = []
})

describe('PublicPostPage', () => {
  it('shows a public post with its workout card when there is no photo', () => {
    state.post = POST
    renderAt()
    expect(state.args).toContainEqual({ postId: 'p1' })
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('New bench PB')).toBeInTheDocument()
    expect(screen.getByText('Push Day')).toBeInTheDocument()
    expect(screen.getByText(/Bench Press · Dips/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('❤️ 3 · 💬 2')).toBeInTheDocument()
  })

  it('shows the photo when the post has one', () => {
    state.post = { ...POST, photoUrl: 'https://x.convex.cloud/photo', photoWidth: 1080, photoHeight: 1350 }
    const { container } = renderAt()
    expect(container.querySelector('img[src="https://x.convex.cloud/photo"]')).toBeInTheDocument()
  })

  it('says so when the post isn’t public, and still offers to join', () => {
    state.post = null
    renderAt('secret')
    expect(screen.getByText('This post isn’t public')).toBeInTheDocument()
    expect(screen.queryByText('New bench PB')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join Swole' })).toBeInTheDocument()
  })

  it('shows a loading state first', () => {
    renderAt()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('opens sign-up from Join, and sign-in for existing accounts', async () => {
    state.post = POST
    const { unmount } = renderAt()
    await userEvent.click(screen.getByRole('button', { name: 'Join Swole' }))
    expect(screen.getByText('sign-in:signUp')).toBeInTheDocument()
    unmount()

    renderAt()
    await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    expect(screen.getByText('sign-in:signIn')).toBeInTheDocument()
  })
})

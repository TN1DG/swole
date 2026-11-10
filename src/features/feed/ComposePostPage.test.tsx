import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  createPost: vi.fn((_args: Record<string, unknown>) => Promise.resolve({ ok: true, postId: 'p1' })),
  uploadBlob: vi.fn(() => Promise.resolve('card-storage-id')),
  cardToPng: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) =>
      name(ref) === 'history:getDetail'
        ? {
            _id: 'w1',
            name: 'Push Day',
            startedAt: 0,
            endedAt: 3_600_000,
            prExerciseIds: [],
            exercises: [{ workoutExerciseId: 'we1', exercise: { _id: 'e1', name: 'Bench Press' }, sets: [] }],
          }
        : undefined,
    useMutation: (ref: Parameters<typeof name>[0]) =>
      name(ref) === 'feed:createPost' ? state.createPost : vi.fn(),
  }
})
vi.mock('../../lib/uploadBlob', () => ({ uploadBlob: state.uploadBlob }))
vi.mock('../share/useCardExport', () => ({ cardToPng: state.cardToPng }))

const { ComposePostPage } = await import('./ComposePostPage')

function renderComposer() {
  render(
    <MemoryRouter initialEntries={['/feed/compose/w1']}>
      <Routes>
        <Route path="/feed/compose/:workoutId" element={<ComposePostPage />} />
        <Route path="/friends" element={<div>feed</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('ComposePostPage link-preview card', () => {
  it('renders the workout card for a public post without a photo and sends it along', async () => {
    renderComposer()
    await userEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(state.createPost).toHaveBeenCalled())
    expect(state.cardToPng).toHaveBeenCalledWith(expect.any(HTMLElement), 1200)
    expect(state.createPost.mock.calls[0]![0]).toMatchObject({ visibility: 'public', cardStorageId: 'card-storage-id' })
  })

  it('makes no card for a friends-only post, which never previews', async () => {
    renderComposer()
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(state.createPost).toHaveBeenCalled())
    expect(state.cardToPng).not.toHaveBeenCalled()
    expect(state.createPost.mock.calls[0]![0]).not.toHaveProperty('cardStorageId')
  })

  it('still posts if the card can’t be made', async () => {
    state.cardToPng.mockRejectedValueOnce(new Error('canvas tainted'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderComposer()
    await userEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => expect(screen.getByText('feed')).toBeInTheDocument())
    expect(state.createPost.mock.calls[0]![0]).not.toHaveProperty('cardStorageId')
  })
})

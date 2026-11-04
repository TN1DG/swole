import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'

const state = vi.hoisted(() => ({ queries: new Map<string, unknown>() }))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  const { vi: vitest } = await import('vitest')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: () => vitest.fn(() => Promise.resolve({ ok: true })),
  }
})

// Reports the friend as online and typing-free, as if they were in the room.
vi.mock('@convex-dev/presence/react', () => ({
  default: () => [{ userId: 'friend1', online: true, lastDisconnected: 0 }],
}))

const { FriendChatPage } = await import('./FriendChatPage')

const FRIEND = { userId: 'friend1', displayName: 'Sam', avatarUrl: null }

function renderChat() {
  const page = () => (
    <MemoryRouter initialEntries={['/friends/friend1/chat']}>
      <Routes>
        <Route path="/friends/:userId/chat" element={<FriendChatPage />} />
      </Routes>
    </MemoryRouter>
  )
  return { page, ...render(page()) }
}

beforeEach(() => {
  // jsdom has no matchMedia; the composer asks whether this is a touch device.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  state.queries.clear()
  state.queries.set(getFunctionName(api.profiles.getMine), { userId: 'me1' })
  state.queries.set(getFunctionName(api.friendThread.getThread), [])
  state.queries.set(getFunctionName(api.friendThread.friendReadAt), null)
  state.queries.set(getFunctionName(api.friends.myFriends), [FRIEND])
})

describe('FriendChatPage', () => {
  it('shows a friend as active, and offers the composer', async () => {
    renderChat()
    expect(await screen.findByText('Active now')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument()
  })

  // Found in browser testing: being removed left "… … Active now" in the header,
  // because the last presence state outlived the friendship and the name only came
  // from the friends list.
  it('drops the status and keeps the name once you are no longer friends', async () => {
    const { page, rerender } = renderChat()
    await screen.findByText('Active now')

    state.queries.set(getFunctionName(api.friends.myFriends), [])
    state.queries.set(getFunctionName(api.friendThread.partnerName), 'Sam')
    rerender(page())

    expect(screen.queryByText('Active now')).not.toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText(/no longer friends/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument()
  })
})

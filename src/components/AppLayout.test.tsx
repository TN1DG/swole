import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../convex/_generated/api'

// Same "answer useQuery by function name" shape as ActiveWorkout.test.tsx.
const state = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: () => vi.fn(),
  }
})

// Each carries its own Convex subscriptions and business logic that's out of
// scope here — stubbed out so this file only exercises AppLayout's own
// header/nav, in particular the new notification-bell badge.
vi.mock('./PingAckBanner', () => ({ PingAckBanner: () => null }))
vi.mock('./NotificationsBanner', () => ({ NotificationsBanner: () => null }))
vi.mock('../features/releases/WhatsNewDialog', () => ({ WhatsNewGate: () => null }))

const { AppLayout } = await import('./AppLayout')

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<div>Page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.queries.clear()
  vi.clearAllMocks()
  state.queries.set(getFunctionName(api.profiles.getMine), null)
})

// The header bell is the new persistent entry point to /notifications —
// previously the in-page banner (mocked out above) was the only way in.
// Its unread dot mirrors NotificationsBanner's own query, so this only
// covers the badge's own visibility wiring, not notification content.
describe('AppLayout notification bell', () => {
  it('hides the unread dot when there are no unread notifications', () => {
    state.queries.set(getFunctionName(api.notifications.listUnread), [])
    const { container } = renderLayout()
    const badge = container.querySelector('.MuiBadge-badge')
    expect(badge).not.toBeNull()
    expect(badge!.className).toMatch(/invisible/i)
  })

  it('shows the unread dot when there are unread notifications', () => {
    state.queries.set(getFunctionName(api.notifications.listUnread), [{ _id: 'n1' }])
    const { container } = renderLayout()
    const badge = container.querySelector('.MuiBadge-badge')
    expect(badge).not.toBeNull()
    expect(badge!.className).not.toMatch(/invisible/i)
  })

  // useQuery returns undefined while a subscription is still loading —
  // `!unreadNotifications` must fail safe to hidden, not crash on `.length`.
  it('hides the dot while the query is still loading', () => {
    const { container } = renderLayout()
    const badge = container.querySelector('.MuiBadge-badge')
    expect(badge).not.toBeNull()
    expect(badge!.className).toMatch(/invisible/i)
  })
})

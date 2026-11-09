import { MemoryRouter } from 'react-router-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  results: {} as Record<string, unknown>,
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0], args?: { period?: string }) => {
      const key = name(ref)
      // The leaderboard answers per period, so the toggle is observable.
      if (key === 'clanChat:leaderboard') return (state.results[key] as Record<string, unknown>)[args!.period!]
      return state.results[key]
    },
    useMutation: (ref: Parameters<typeof name>[0]) => (args: unknown) => {
      state.calls.push({ name: name(ref), args })
      return Promise.resolve({ ok: true })
    },
  }
})
vi.mock('@convex-dev/presence/react', () => ({ default: () => [] }))

const { ClanChatPage } = await import('./ClanChatPage')

const person = (userId: string, displayName: string) => ({ userId, username: displayName.toLowerCase(), displayName, avatarUrl: null })
const row = (userId: string, displayName: string, points: number, extra: object = {}) => ({
  ...person(userId, displayName),
  points,
  daysTrained: points / 10,
  joinedAt: 0,
  mvpCount: 0,
  isMe: false,
  isLeader: false,
  ...extra,
})

beforeEach(() => {
  // jsdom has no matchMedia; the composer asks whether this is a touch device.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  state.calls.length = 0
  state.results = {
    'profiles:getMine': { userId: 'me' },
    'clanChat:members': [
      { ...person('me', 'Me'), isMe: true, isLeader: true },
      { ...person('u2', 'Bob'), isMe: false, isLeader: false },
      { ...person('u3', 'Cara'), isMe: false, isLeader: false },
    ],
    'clanChat:leaderboard': {
      week: [row('u2', 'Bob', 40, { mvpCount: 2 }), row('u3', 'Cara', 20), row('me', 'Me', 10, { isMe: true })],
      month: [row('u3', 'Cara', 90), row('me', 'Me', 60, { isMe: true }), row('u2', 'Bob', 40)],
    },
    'clanChat:getThread': {
      clanId: 'c1',
      name: 'Iron Wolves',
      memberCount: 3,
      isLeader: true,
      entries: [
        {
          type: 'message',
          key: 'm1',
          ts: Date.now() - 60_000,
          isMine: false,
          sender: person('u2', 'Bob'),
          message: { _id: 'm1', text: 'Leg day?', imageUrl: null, imageWidth: null, imageHeight: null, reactions: [] },
        },
        {
          type: 'ping',
          key: 'p1',
          ts: Date.now() - 30_000,
          isMine: false,
          sender: person('u3', 'Cara'),
          ping: { _id: 'p1', targets: null, going: [person('u2', 'Bob')], iAmGoing: false, canRespond: true, open: true },
        },
        {
          type: 'mvp',
          key: 'v1',
          ts: Date.now() - 10_000,
          isMine: false,
          winnerIsMe: false,
          winner: person('u2', 'Bob'),
          mvp: { weekStart: Date.UTC(2026, 10, 2), points: 40, daysTrained: 4 },
        },
      ],
    },
  }
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ClanChatPage />
    </MemoryRouter>,
  )

describe('ClanChatPage', () => {
  it('shows the thread: who said what, the clan ping, and the MVP post', () => {
    renderPage()
    expect(screen.getByText('Iron Wolves')).toBeInTheDocument()
    expect(screen.getByText('Leg day?')).toBeInTheDocument()
    expect(screen.getByText('💪 Cara pinged the clan')).toBeInTheDocument()
    expect(screen.getByText('Bob is going')).toBeInTheDocument()
    expect(screen.getByText("Bob is the week's MVP")).toBeInTheDocument()
  })

  it('answers a ping with "I\'m going"', async () => {
    renderPage()
    await userEvent.setup().click(screen.getByRole('button', { name: "I'm going 🙋" }))
    expect(state.calls).toContainEqual({ name: 'clanChat:respondToPing', args: { pingId: 'p1' } })
  })

  it('pins the clan leaderboard, with a week/month toggle', async () => {
    renderPage()
    const user = userEvent.setup()
    expect(screen.getByText(/1\. Bob 40 · 2\. Cara 20 · you #3/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show clan leaderboard' }))
    expect(screen.getByText('👑')).toBeInTheDocument()
    expect(screen.getByText(/2× MVP/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByText(/1\. Cara 90 · 2\. You 60/)).toBeInTheDocument()
  })

  it('pings the whole clan, or just the picked members', async () => {
    renderPage()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: /Gym ping/ }))
    await user.click(screen.getByRole('button', { name: 'Ping the whole clan' }))
    expect(state.calls).toContainEqual({ name: 'clanChat:ping', args: {} })

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: /Gym ping/ }))
    const sheet = screen.getByText('Or pick clanmates').parentElement!
    await user.click(within(sheet).getByLabelText('Ping Cara'))
    await user.click(screen.getByRole('button', { name: 'Ping 1 selected' }))
    expect(state.calls).toContainEqual({ name: 'clanChat:ping', args: { targetUserIds: ['u3'] } })
  })

  it('has no challenge action in a clan', async () => {
    renderPage()
    await userEvent.setup().click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: /Challenge/ })).not.toBeInTheDocument()
  })

  it('says so when you are not in a clan', () => {
    state.results['clanChat:getThread'] = null
    renderPage()
    expect(screen.getByText(/not in a clan/)).toBeInTheDocument()
  })
})

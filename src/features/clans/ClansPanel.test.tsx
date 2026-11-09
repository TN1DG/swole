import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  results: {} as Record<string, unknown>,
}))

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.results[name(ref)],
    useMutation: (ref: Parameters<typeof name>[0]) => (args: unknown) => {
      state.calls.push({ name: name(ref), args })
      return Promise.resolve()
    },
  }
})

const { ClansPanel } = await import('./ClansPanel')

const member = (overrides: object) => ({
  userId: 'u1',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  points: 30,
  daysTrained: 3,
  isMe: true,
  isLeader: true,
  ...overrides,
})

beforeEach(() => {
  state.calls.length = 0
  state.results = {}
})

describe('ClansPanel', () => {
  it('offers create and join when you have no clan', async () => {
    state.results = { 'clans:myClan': null, 'clans:rankings': [] }
    render(<ClansPanel />)
    const user = userEvent.setup()

    expect(screen.getByText('No clans on the board yet this month.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Clan name'), 'Iron Wolves')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await user.type(screen.getByLabelText('Invite code'), 'abcd2345')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    expect(state.calls).toEqual([
      { name: 'clans:create', args: { name: 'Iron Wolves' } },
      { name: 'clans:joinByCode', args: { code: 'abcd2345' } },
    ])
  })

  it('shows your clan, its CP and rank, and the standings, with the chat one tap away', async () => {
    state.results = {
      'clans:myClan': {
        clanId: 'c1',
        name: 'Iron Wolves',
        memberCount: 2,
        maxMembers: 20,
        inviteCode: 'ABCD2345',
        isLeader: true,
        cp: 50,
        rank: 2,
        rankScanLimit: 200,
        members: [member({}), member({ userId: 'u2', displayName: 'Bob', points: 20, isMe: false, isLeader: false })],
      },
      'clans:rankings': [
        { clanId: 'c0', name: 'Bench Club', memberCount: 5, cp: 90, isMine: false },
        { clanId: 'c1', name: 'Iron Wolves', memberCount: 2, cp: 50, isMine: true },
      ],
      'clanChat:overview': { clanId: 'c1', name: 'Iron Wolves', memberCount: 2, unread: true, last: null },
    }
    render(<ClansPanel />)
    const user = userEvent.setup()

    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByText('ABCD2345')).toBeInTheDocument()
    expect(screen.getByText('2/20 members')).toBeInTheDocument()
    expect(screen.getByText('Bench Club')).toBeInTheDocument()

    // The members list and the clan's own leaderboard live in the clan chat now.
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    const chat = screen.getByRole('link', { name: /Open clan chat/ })
    expect(chat).toHaveAttribute('href', '/clans/chat')
    expect(screen.getByLabelText('unread')).toBeInTheDocument()

    // Leaving asks first.
    await user.click(screen.getByRole('button', { name: 'Leave clan' }))
    expect(screen.getByText(/can't join another clan until next month/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Leave clan' }))

    expect(state.calls).toEqual([{ name: 'clans:leave', args: {} }])
  })
})

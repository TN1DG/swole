import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  calls: [] as { name: string; args: unknown }[],
  profile: { avatarUrl: null, pointsBalance: 40 } as unknown,
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: () => state.profile,
    useMutation: (ref: Parameters<typeof name>[0]) => (args: unknown) => {
      state.calls.push({ name: name(ref), args })
      return Promise.resolve()
    },
  }
})

const { ChallengeCard } = await import('./ChallengeCard')
const { ChallengeComposeDialog } = await import('./ChallengeComposeDialog')

type Challenge = Parameters<typeof ChallengeCard>[0]['challenge']

function challenge(overrides: Partial<Challenge>): Challenge {
  return {
    _id: 'c1',
    challengerId: 'me',
    opponentId: 'sam',
    status: 'pending',
    weeks: 4,
    wagerPoints: 20,
    createdAt: 0,
    isMine: true,
    liveChallengerStreak: undefined,
    liveOpponentStreak: undefined,
    ...overrides,
  } as Challenge
}

const renderCard = (overrides: Partial<Challenge>) =>
  render(<ChallengeCard challenge={challenge(overrides)} friendName="Sam" />)

beforeEach(() => {
  state.calls.length = 0
  state.profile = { avatarUrl: null, pointsBalance: 40 }
})

describe('ChallengeCard', () => {
  it('asks for a decision on an incoming challenge, showing the real pot', async () => {
    renderCard({ isMine: false })
    const user = userEvent.setup()

    expect(screen.getByText('Your move')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText(/holds 20 of your points/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Accept' }))
    expect(state.calls).toEqual([{ name: 'challenges:accept', args: { challengeId: 'c1' } }])
  })

  it('lets the sender cancel while waiting', async () => {
    renderCard({ isMine: true })
    const user = userEvent.setup()

    expect(screen.getByText('Waiting')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel challenge' }))
    expect(state.calls[0]!.name).toBe('challenges:cancel')
  })

  it('keeps You on your own score when the friend started it', () => {
    renderCard({
      status: 'active',
      isMine: false,
      liveChallengerStreak: 3,
      liveOpponentStreak: 1,
      endsAt: Date.now() + 86_400_000 * 3,
    })

    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByLabelText('You: 1 of 4 weeks')).toBeInTheDocument()
    expect(screen.getByLabelText('Sam: 3 of 4 weeks')).toBeInTheDocument()
    expect(screen.getByText('Sam leads by 2 weeks')).toBeInTheDocument()
    expect(screen.getByText('3 days left')).toBeInTheDocument()
  })

  it('shows the final score and the result', () => {
    renderCard({
      status: 'resolved',
      winnerId: 'me',
      liveChallengerStreak: 4,
      liveOpponentStreak: 2,
    } as Partial<Challenge>)

    expect(screen.getByText('Won')).toBeInTheDocument()
    expect(screen.getByText('You won the 40 pot')).toBeInTheDocument()
    expect(screen.getByLabelText('You: 4 of 4 weeks')).toBeInTheDocument()
  })

  it('says a loss and a tie plainly', () => {
    const { unmount } = renderCard({ status: 'resolved', winnerId: 'sam' } as Partial<Challenge>)
    expect(screen.getByText('Sam won the 40 pot')).toBeInTheDocument()
    unmount()

    renderCard({ status: 'resolved' })
    expect(screen.getByText('Tied, so both stakes were returned')).toBeInTheDocument()
  })

  it('shrinks a challenge that never ran to one line', () => {
    renderCard({ status: 'declined', isMine: true })

    expect(screen.getByText(/Sam declined your challenge/)).toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('ChallengeComposeDialog', () => {
  const renderSheet = () =>
    render(<ChallengeComposeDialog friendId={'sam' as never} friendName="Sam" onClose={() => {}} />)

  it('sends exactly what was chosen', async () => {
    renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '4 weeks' }))
    await user.click(screen.getByRole('button', { name: 'Stake 10' }))
    await user.click(screen.getByRole('button', { name: 'Raise stake' }))
    await user.click(screen.getByRole('button', { name: 'Send challenge' }))

    expect(state.calls).toEqual([
      { name: 'challenges:propose', args: { opponentId: 'sam', weeks: 4, wagerPoints: 15 } },
    ])
  })

  it('caps the stake at your balance', async () => {
    renderSheet()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Stake the maximum, 40/ }))

    expect(screen.getByRole('button', { name: 'Raise stake' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Stake 50' })).not.toBeInTheDocument()
  })

  // This used to offer a wager anyway, which then failed on sending.
  it('explains instead of offering a form with no points', () => {
    state.profile = { avatarUrl: null, pointsBalance: 0 }
    renderSheet()

    expect(screen.getByText('You need points to wager')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send challenge' })).not.toBeInTheDocument()
  })

  it('waits for the balance rather than guessing one', () => {
    state.profile = undefined
    renderSheet()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send challenge' })).not.toBeInTheDocument()
  })
})

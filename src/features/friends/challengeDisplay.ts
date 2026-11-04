// How a challenge reads from one person's side. Plain functions, so every state's
// wording and arithmetic can be tested without rendering anything.

type ChallengeFacts = {
  status: 'pending' | 'active' | 'resolved' | 'declined' | 'cancelled'
  isMine: boolean // I started it
  challengerId: string
  winnerId?: string
  liveChallengerStreak?: number
  liveOpponentStreak?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Always mine and theirs, whoever started it, so "You" never swaps sides.
export function myAndTheirStreak(challenge: ChallengeFacts): { mine: number; theirs: number } {
  const challenger = challenge.liveChallengerStreak ?? 0
  const opponent = challenge.liveOpponentStreak ?? 0
  return challenge.isMine
    ? { mine: challenger, theirs: opponent }
    : { mine: opponent, theirs: challenger }
}

export type ChallengeOutcome = 'won' | 'lost' | 'tied'

export function challengeOutcome(challenge: ChallengeFacts): ChallengeOutcome | null {
  if (challenge.status !== 'resolved') return null
  if (challenge.winnerId === undefined) return 'tied'
  const iAmWinner = challenge.isMine === (challenge.winnerId === challenge.challengerId)
  return iAmWinner ? 'won' : 'lost'
}

export function leadLabel(mine: number, theirs: number, friendName: string): string {
  if (mine === theirs) return mine === 0 ? 'No weeks on the board yet' : 'All square'
  const gap = Math.abs(mine - theirs)
  const weeks = `${gap} week${gap === 1 ? '' : 's'}`
  return mine > theirs ? `You lead by ${weeks}` : `${friendName} leads by ${weeks}`
}

export function timeLeftLabel(endsAt: number, now: number): string {
  const remaining = endsAt - now
  // The result is settled by a scheduled job shortly after the window closes.
  if (remaining <= 0) return 'Finishing up'
  const days = Math.ceil(remaining / DAY_MS)
  return days === 1 ? 'Last day' : `${days} days left`
}

// The one-line record a challenge that never ran leaves in the conversation.
export function closedLabel(
  status: 'declined' | 'cancelled',
  isMine: boolean,
  friendName: string,
): string {
  if (status === 'declined') {
    return isMine ? `${friendName} declined your challenge` : `You declined ${friendName}'s challenge`
  }
  return isMine ? 'You cancelled your challenge' : `${friendName} cancelled their challenge`
}

const WAGER_PRESETS = [10, 25, 50, 100]

// The round amounts you can afford. Max is offered separately.
export function wagerPresets(maxWager: number): number[] {
  return WAGER_PRESETS.filter((amount) => amount < maxWager)
}

export const WAGER_STEP = 5

export function stepWager(current: number, direction: 1 | -1, maxWager: number): number {
  return Math.max(1, Math.min(maxWager, current + direction * WAGER_STEP))
}

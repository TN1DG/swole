import { describe, expect, it } from 'vitest'
import {
  challengeOutcome,
  closedLabel,
  leadLabel,
  myAndTheirStreak,
  stepWager,
  timeLeftLabel,
  wagerPresets,
} from './challengeDisplay'

const DAY = 24 * 60 * 60 * 1000
const base = { challengerId: 'me', status: 'resolved' as const, isMine: true }

describe('myAndTheirStreak', () => {
  it('keeps me as mine whoever started it', () => {
    const streaks = { liveChallengerStreak: 3, liveOpponentStreak: 1 }
    expect(myAndTheirStreak({ ...base, ...streaks })).toEqual({ mine: 3, theirs: 1 })
    expect(myAndTheirStreak({ ...base, ...streaks, isMine: false })).toEqual({ mine: 1, theirs: 3 })
  })

  it('reads a missing streak as zero', () => {
    expect(myAndTheirStreak(base)).toEqual({ mine: 0, theirs: 0 })
  })
})

describe('challengeOutcome', () => {
  it('has no outcome until resolved', () => {
    expect(challengeOutcome({ ...base, status: 'active' })).toBeNull()
  })

  it('reads a resolved challenge with no winner as a tie', () => {
    expect(challengeOutcome(base)).toBe('tied')
  })

  it('works from both sides of the same result', () => {
    const challengerWon = { ...base, winnerId: 'me' }
    expect(challengeOutcome(challengerWon)).toBe('won')
    expect(challengeOutcome({ ...challengerWon, isMine: false })).toBe('lost')

    const opponentWon = { ...base, winnerId: 'them' }
    expect(challengeOutcome(opponentWon)).toBe('lost')
    expect(challengeOutcome({ ...opponentWon, isMine: false })).toBe('won')
  })
})

describe('leadLabel', () => {
  it.each([
    [0, 0, 'No weeks on the board yet'],
    [2, 2, 'All square'],
    [2, 1, 'You lead by 1 week'],
    [3, 1, 'You lead by 2 weeks'],
    [1, 2, 'Sam leads by 1 week'],
  ])('%i vs %i', (mine, theirs, label) => {
    expect(leadLabel(mine, theirs, 'Sam')).toBe(label)
  })
})

describe('timeLeftLabel', () => {
  const now = 1_000_000

  it('counts whole days, rounding up', () => {
    expect(timeLeftLabel(now + 3 * DAY, now)).toBe('3 days left')
    expect(timeLeftLabel(now + 2 * DAY + 1, now)).toBe('3 days left')
  })

  it('says last day within the final 24 hours', () => {
    expect(timeLeftLabel(now + DAY, now)).toBe('Last day')
    expect(timeLeftLabel(now + 1, now)).toBe('Last day')
  })

  it('covers the gap before the result is settled', () => {
    expect(timeLeftLabel(now, now)).toBe('Finishing up')
    expect(timeLeftLabel(now - DAY, now)).toBe('Finishing up')
  })
})

describe('closedLabel', () => {
  it('says who did what, from either side', () => {
    expect(closedLabel('declined', true, 'Sam')).toBe('Sam declined your challenge')
    expect(closedLabel('declined', false, 'Sam')).toBe("You declined Sam's challenge")
    expect(closedLabel('cancelled', true, 'Sam')).toBe('You cancelled your challenge')
    expect(closedLabel('cancelled', false, 'Sam')).toBe('Sam cancelled their challenge')
  })
})

describe('wagerPresets', () => {
  it('only offers what you can afford, leaving the top to Max', () => {
    expect(wagerPresets(250)).toEqual([10, 25, 50, 100])
    expect(wagerPresets(40)).toEqual([10, 25])
    expect(wagerPresets(25)).toEqual([10])
    expect(wagerPresets(3)).toEqual([])
  })
})

describe('stepWager', () => {
  it('moves in fives and stays within 1 and the maximum', () => {
    expect(stepWager(20, 1, 250)).toBe(25)
    expect(stepWager(20, -1, 250)).toBe(15)
    expect(stepWager(3, -1, 250)).toBe(1)
    expect(stepWager(248, 1, 250)).toBe(250)
  })
})

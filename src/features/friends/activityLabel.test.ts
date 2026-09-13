import { describe, expect, it } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import { formatLastActivity } from './activityLabel'

const friendId = 'friend1' as Id<'users'>
const ts = 0

describe('formatLastActivity', () => {
  it('formats a message with no icon, prefixing "You: " only for my own', () => {
    expect(formatLastActivity({ friendId, ts, kind: 'message', isMine: true, text: 'hey' })).toEqual({
      icon: null,
      text: 'You: hey',
    })
    expect(formatLastActivity({ friendId, ts, kind: 'message', isMine: false, text: 'hey' })).toEqual({
      icon: null,
      text: 'hey',
    })
  })

  it('formats every ping direction/ack combination', () => {
    expect(
      formatLastActivity({ friendId, ts, kind: 'ping', isMine: true, acknowledged: false }),
    ).toEqual({ icon: '🏋️', text: 'You pinged them' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'ping', isMine: true, acknowledged: true }),
    ).toEqual({ icon: '🏋️', text: 'Held accountable' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'ping', isMine: false, acknowledged: false }),
    ).toEqual({ icon: '🏋️', text: 'Pinged you' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'ping', isMine: false, acknowledged: true }),
    ).toEqual({ icon: '🏋️', text: 'You held them accountable' })
  })

  it('formats every challenge status/outcome combination', () => {
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'pending', outcome: null }),
    ).toEqual({ icon: '⚔️', text: 'Challenge sent' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: false, status: 'pending', outcome: null }),
    ).toEqual({ icon: '⚔️', text: 'New challenge' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'active', outcome: null }),
    ).toEqual({ icon: '⚔️', text: 'Challenge active' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'resolved', outcome: 'won' }),
    ).toEqual({ icon: '🏆', text: 'You won the challenge!' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'resolved', outcome: 'lost' }),
    ).toEqual({ icon: '⚔️', text: 'Challenge lost' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'resolved', outcome: 'tied' }),
    ).toEqual({ icon: '⚔️', text: 'Challenge tied' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'declined', outcome: null }),
    ).toEqual({ icon: '⚔️', text: 'Challenge declined' })
    expect(
      formatLastActivity({ friendId, ts, kind: 'challenge', isMine: true, status: 'cancelled', outcome: null }),
    ).toEqual({ icon: '⚔️', text: 'Challenge cancelled' })
  })
})

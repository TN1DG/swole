import { describe, expect, it } from 'vitest'
import { conversationTimeLabel, countUnseen, dayLabel, isBigEmoji, layoutThread } from './threadLayout'

const NOON = new Date(2026, 10, 4, 12, 0).getTime()
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const message = (key: string, ts: number, isMine = true, type = 'message') => ({
  key,
  ts,
  isMine,
  type,
})

function joined(items: ReturnType<typeof layoutThread>) {
  return items.flatMap((i) => (i.kind === 'entry' ? [[i.key, i.joinedAbove, i.joinedBelow]] : []))
}

describe('layoutThread', () => {
  it('joins a burst from one sender', () => {
    const items = layoutThread(
      [message('a', NOON), message('b', NOON + MINUTE), message('c', NOON + 2 * MINUTE)],
      NOON,
    )
    expect(joined(items)).toEqual([
      ['a', false, true],
      ['b', true, true],
      ['c', true, false],
    ])
  })

  it('breaks the burst when the sender changes', () => {
    const items = layoutThread([message('a', NOON, true), message('b', NOON + 1, false)], NOON)
    expect(joined(items)).toEqual([
      ['a', false, false],
      ['b', false, false],
    ])
  })

  it('breaks the burst after a pause', () => {
    const items = layoutThread([message('a', NOON), message('b', NOON + 4 * MINUTE)], NOON)
    expect(joined(items)).toEqual([
      ['a', false, false],
      ['b', false, false],
    ])
  })

  it('never joins a ping or challenge to a message', () => {
    const items = layoutThread(
      [message('a', NOON), message('p', NOON + 1, true, 'ping'), message('b', NOON + 2)],
      NOON,
    )
    expect(joined(items)).toEqual([
      ['a', false, false],
      ['p', false, false],
      ['b', false, false],
    ])
  })

  it('puts a divider before the first entry of each day, and breaks bursts across midnight', () => {
    const lateNight = new Date(2026, 10, 3, 23, 59).getTime()
    const items = layoutThread(
      [message('a', lateNight), message('b', lateNight + MINUTE), message('c', NOON)],
      NOON,
    )
    expect(items.map((i) => (i.kind === 'day' ? i.label : i.key))).toEqual([
      'Yesterday',
      'a',
      'Today',
      'b',
      'c',
    ])
    expect(joined(items)[0]).toEqual(['a', false, false])
  })

  it('renders nothing for an empty thread', () => {
    expect(layoutThread([], NOON)).toEqual([])
  })
})

describe('countUnseen', () => {
  const thread = [
    message('old', NOON - 10 * MINUTE, false),
    message('seen', NOON, false),
    message('mine', NOON + MINUTE, true),
    message('new', NOON + 2 * MINUTE, false),
  ]

  it('counts only what the other person sent since you were at the bottom', () => {
    expect(countUnseen(thread, NOON)).toBe(1)
  })

  it('is zero once you have caught up', () => {
    expect(countUnseen(thread, NOON + 2 * MINUTE)).toBe(0)
  })

  it('ignores older history loading in above', () => {
    expect(countUnseen([message('older', NOON - DAY, false), ...thread], NOON)).toBe(1)
  })
})

describe('dayLabel', () => {
  it('uses plain words for recent days', () => {
    expect(dayLabel(NOON, NOON)).toBe('Today')
    expect(dayLabel(NOON - DAY, NOON)).toBe('Yesterday')
    expect(dayLabel(NOON - 3 * DAY, NOON)).toBe(
      new Date(NOON - 3 * DAY).toLocaleDateString([], { weekday: 'long' }),
    )
  })

  it('shows the year only when it differs', () => {
    expect(dayLabel(new Date(2025, 0, 1).getTime(), NOON)).toContain('2025')
    expect(dayLabel(new Date(2026, 0, 1).getTime(), NOON)).not.toContain('2026')
  })
})

describe('conversationTimeLabel', () => {
  it('says Yesterday for yesterday', () => {
    expect(conversationTimeLabel(NOON - DAY, NOON)).toBe('Yesterday')
  })
})

describe('isBigEmoji', () => {
  it.each(['🔥', '💪🔥', '🔥 💪 😂', '👍🏽', '🏋️‍♂️', '🇳🇬', '❤️'])('enlarges %s', (text) => {
    expect(isBigEmoji(text)).toBe(true)
  })

  it.each(['', '   ', 'hi', 'hi 🔥', '🔥🔥🔥🔥', '123', '#', '*'])('leaves %j alone', (text) => {
    expect(isBigEmoji(text)).toBe(false)
  })
})

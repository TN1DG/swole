import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { cardFileName } from './cardFormat'

vi.mock('convex/react', () => ({ useQuery: () => ({ unitPreference: 'kg' }) }))

const { ShareCard } = await import('./ShareCard')
const { FriendTrophyCard } = await import('../friends/FriendTrophyCard')

const NAMES = ['Bench Press', 'Squat', 'Deadlift', 'Row', 'Curl']

/** A finished workout with one 60 kg × 8 set per exercise. */
const detail = {
  _id: 'w1',
  name: 'Push Day',
  startedAt: Date.UTC(2026, 10, 9, 18),
  endedAt: Date.UTC(2026, 10, 9, 19),
  prExerciseIds: [],
  exercises: NAMES.map((name, i) => ({
    workoutExerciseId: `we${i}`,
    exercise: { _id: `ex${i}`, name },
    sets: [{ weightKg: 60, reps: 8, isWarmup: false }],
  })),
  owner: { displayName: 'Sam' },
  consistency: { tier: 'none' },
} as never

const frame = (container: HTMLElement) => container.querySelector('[data-format]') as HTMLElement
// jsdom serialises '9 / 16' as '9/16'; compare without the spaces.
const aspect = (container: HTMLElement) => getComputedStyle(frame(container)).aspectRatio.replace(/\s/g, '')

describe('share card formats', () => {
  it('story is a 9:16 frame with up to six exercises', () => {
    const { container } = render(<ShareCard detail={detail} photoUrl={null} format="story" />)
    expect(frame(container).dataset.format).toBe('story')
    expect(aspect(container)).toBe('9/16')
    for (const name of NAMES) expect(screen.getByText(new RegExp(name))).toBeInTheDocument()
    expect(screen.queryByText(/more exercises/)).not.toBeInTheDocument()
  })

  it('square is 1:1 and trims the list to three, with "+ N more"', () => {
    const { container } = render(<ShareCard detail={detail} photoUrl={null} format="square" />)
    expect(aspect(container)).toBe('1/1')
    expect(screen.getByText(/Squat/)).toBeInTheDocument()
    expect(screen.queryByText(/Row/)).not.toBeInTheDocument()
    expect(screen.getByText('+ 2 more exercises')).toBeInTheDocument()
  })

  it('keeps the photo and the frame shape together', () => {
    const { container } = render(<ShareCard detail={detail} photoUrl="blob:photo" format="square" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:photo')
    expect(aspect(container)).toBe('1/1')
  })

  it('applies to the friend trophy card too', () => {
    const { container } = render(<FriendTrophyCard detail={detail} format="square" variant="transparent" />)
    expect(aspect(container)).toBe('1/1')
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('+ 2 more exercises')).toBeInTheDocument()
  })
})

describe('cardFileName', () => {
  it('slugs the name and tags the format', () => {
    expect(cardFileName('Push Day!', 'story')).toBe('swole-push-day-story.png')
    expect(cardFileName('💪', 'square')).toBe('swole-workout-square.png')
  })
})

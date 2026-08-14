import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'
import { epley1rm } from '../../../convex/fitness'

// Convex's hooks are the only thing standing between this component and a real
// websocket. `useQuery` dispatches on the function's name so each query can be
// answered independently — ActiveWorkout reads `prs.listMine` directly and
// `profiles.getMine` through useWeightUnit, and the unit tests below depend on
// telling those two apart.
const state = vi.hoisted(() => ({
  queries: new Map<string, unknown>(),
  mutation: vi.fn(() => Promise.resolve()),
}))

vi.mock('convex/react', async () => {
  const { getFunctionName: name } = await import('convex/server')
  return {
    useQuery: (ref: Parameters<typeof name>[0]) => state.queries.get(name(ref)),
    useMutation: () => state.mutation,
    useAction: () => state.mutation,
  }
})

const { ActiveWorkout } = await import('./ActiveWorkout')

const EXERCISE_ID = 'ex1' as never
const RECORD = { exerciseId: EXERCISE_ID, bestWeightKg: 100, bestEst1rm: epley1rm(100, 5) }

/** One exercise, one completed working set at the given weight/reps. */
function workoutWith(sets: { weightKg: number; reps: number; completed?: boolean; isWarmup?: boolean }[]) {
  return {
    _id: 'w1',
    _creationTime: 0,
    name: 'Night Workout',
    startedAt: Date.now() - 60_000,
    ownerId: 'u1',
    exercises: [
      {
        workoutExerciseId: 'we1',
        exercise: { _id: EXERCISE_ID, _creationTime: 0, name: 'Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
        sets: sets.map((s, i) => ({
          _id: `s${i}`,
          _creationTime: 0,
          workoutExerciseId: 'we1',
          setNumber: i + 1,
          weightKg: s.weightKg,
          reps: s.reps,
          completed: s.completed ?? true,
          isWarmup: s.isWarmup ?? false,
        })),
      },
    ],
  } as never
}

function renderWorkout(
  sets: Parameters<typeof workoutWith>[0],
  unitPreference: 'kg' | 'lb' = 'kg',
  records: unknown[] = [RECORD],
) {
  state.queries.set(getFunctionName(api.prs.listMine), records)
  state.queries.set(getFunctionName(api.profiles.getMine), { unitPreference })
  return render(<ActiveWorkout workout={workoutWith(sets)} onFinished={vi.fn()} />)
}

const trophies = () => screen.queryAllByText(/🏆/)

beforeEach(() => {
  state.queries.clear()
  vi.clearAllMocks()
})

describe('ActiveWorkout header', () => {
  it('totals working-set volume in the viewer’s units', () => {
    renderWorkout([{ weightKg: 100, reps: 5 }])
    expect(screen.getByText(/500 kg · 1 sets/)).toBeInTheDocument()
  })

  it('follows unitPreference', () => {
    renderWorkout([{ weightKg: 100, reps: 5 }], 'lb')
    expect(screen.getByText(/1,102.3 lb · 1 sets/)).toBeInTheDocument()
  })

  // Warm-ups are excluded from volume everywhere else in the app; the header
  // must agree or the number people watch during a session is wrong.
  it('leaves warm-ups out of the volume', () => {
    renderWorkout([
      { weightKg: 100, reps: 5 },
      { weightKg: 60, reps: 10, isWarmup: true },
    ])
    expect(screen.getByText(/500 kg/)).toBeInTheDocument()
  })
})

// The trophy and the red slash are the two ways a set is marked against the
// record, and they must never both apply — a tie earns neither.
describe('ActiveWorkout set marks', () => {
  it('slashes a set the record has left behind', () => {
    renderWorkout([{ weightKg: 80, reps: 5 }])
    expect(screen.getByTitle('Beaten by your PR')).toBeInTheDocument()
  })

  it('does not slash the set that ties the record', () => {
    renderWorkout([{ weightKg: 100, reps: 5 }])
    expect(screen.queryByTitle('Beaten by your PR')).not.toBeInTheDocument()
  })

  it('does not slash an incomplete set', () => {
    renderWorkout([{ weightKg: 80, reps: 5, completed: false }])
    expect(screen.queryByTitle('Beaten by your PR')).not.toBeInTheDocument()
  })

  // A warm-up is deliberately light. Marking it "conquered" would slash almost
  // every warm-up in the app.
  it('does not slash a warm-up', () => {
    renderWorkout([{ weightKg: 80, reps: 5, isWarmup: true }])
    expect(screen.queryByTitle('Beaten by your PR')).not.toBeInTheDocument()
  })
})

// `workouts.finish` awards at most one record per exercise, from the best
// working set. The live view has to reach the same answer itself, because
// prs.listMine only carries finished workouts.
describe('ActiveWorkout PR trophy', () => {
  // The reported bug: a brand-new account has no stored record, and "no record
  // yet" means "first PR" — so asking per set marked every single one.
  it('marks only the best set when the account has no records at all', () => {
    renderWorkout(
      [
        { weightKg: 60, reps: 5 },
        { weightKg: 100, reps: 5 },
        { weightKg: 80, reps: 5 },
      ],
      'kg',
      [],
    )
    expect(trophies()).toHaveLength(1)
    // Set 2 — the heaviest — not the first or the last.
    expect(trophies()[0]!.textContent).toContain('2')
  })

  // Same shape with a record present: three ascending sets all beat a 50kg
  // record, but they are still one PR between them.
  it('marks one set, not every set that beats the stored record', () => {
    renderWorkout(
      [
        { weightKg: 60, reps: 5 },
        { weightKg: 70, reps: 5 },
        { weightKg: 80, reps: 5 },
      ],
      'kg',
      [{ exerciseId: EXERCISE_ID, bestWeightKg: 50, bestEst1rm: epley1rm(50, 5) }],
    )
    expect(trophies()).toHaveLength(1)
  })

  it('marks nothing when no set reaches the record', () => {
    renderWorkout([{ weightKg: 80, reps: 5 }])
    expect(trophies()).toHaveLength(0)
  })

  it('ignores warm-ups and incomplete sets when picking the best', () => {
    renderWorkout(
      [
        { weightKg: 200, reps: 5, isWarmup: true },
        { weightKg: 150, reps: 5, completed: false },
        { weightKg: 90, reps: 5 },
      ],
      'kg',
      [],
    )
    expect(trophies()).toHaveLength(1)
    // Set 3, the 90kg working set — not the heavier warm-up above it, nor the
    // 150kg row that was never checked off.
    expect(trophies()[0]!.textContent).toContain('3')
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
  })
})

describe('ActiveWorkout weight entry', () => {
  // Pinned ahead of #22, which will make these inputs unit-aware. Right now
  // they are kg regardless of preference, and the column header says so —
  // if one of those changes without the other, this fails.
  it('keeps the entry column in kg even when display units are pounds', () => {
    renderWorkout([{ weightKg: 100, reps: 5 }], 'lb')

    expect(screen.getByText('kg')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('commits an edited weight on blur', async () => {
    renderWorkout([{ weightKg: 100, reps: 5 }])
    const user = userEvent.setup()

    const input = screen.getByDisplayValue('100')
    await user.clear(input)
    await user.type(input, '105')
    await user.tab()

    expect(state.mutation).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 105 }))
  })
})

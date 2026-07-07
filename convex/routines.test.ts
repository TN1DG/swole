import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  type T,
} from './test.helpers'

async function oneUser() {
  const t = createBackend()
  const exerciseId = await createBuiltInExercise(t)
  const user = asUser(t, await createUser(t, 'alice'))
  return { t, user, exerciseId }
}

describe('routine CRUD', () => {
  it('creates, updates, and removes a routine', async () => {
    const { t, user, exerciseId } = await oneUser()
    const squatId = await createBuiltInExercise(t as T, 'Squat')

    const routineId = await user.mutation(api.routines.create, {
      name: 'Push Day',
      exercises: [{ exerciseId, targetSets: 3 }],
    })

    let [routine] = await user.query(api.routines.list, {})
    expect(routine.name).toBe('Push Day')
    expect(routine.exercises).toEqual([
      { exerciseId, targetSets: 3, name: 'Bench Press' },
    ])

    // Update replaces the exercise list wholesale.
    await user.mutation(api.routines.update, {
      routineId,
      name: 'Leg Day',
      exercises: [{ exerciseId: squatId, targetSets: 5 }],
    })
    ;[routine] = await user.query(api.routines.list, {})
    expect(routine.name).toBe('Leg Day')
    expect(routine.exercises).toEqual([
      { exerciseId: squatId, targetSets: 5, name: 'Squat' },
    ])

    await user.mutation(api.routines.remove, { routineId })
    expect(await user.query(api.routines.list, {})).toEqual([])
  })

  it('validates name, exercise list, and clamps target sets', async () => {
    const { user, exerciseId } = await oneUser()
    await expect(
      user.mutation(api.routines.create, { name: ' ', exercises: [{ exerciseId, targetSets: 3 }] }),
    ).rejects.toThrow(/name/i)
    await expect(
      user.mutation(api.routines.create, { name: 'Empty', exercises: [] }),
    ).rejects.toThrow(/at least one/i)

    // targetSets clamps into 1..10 instead of throwing.
    await user.mutation(api.routines.create, {
      name: 'Clamped',
      exercises: [{ exerciseId, targetSets: 99 }],
    })
    const [routine] = await user.query(api.routines.list, {})
    expect(routine.exercises[0].targetSets).toBe(10)
  })
})

describe('startFromRoutine', () => {
  it('pre-fills sets from the last performance of each exercise', async () => {
    const { user, exerciseId } = await oneUser()

    // Historical session: 100x5, then 105x3.
    const w1 = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId: w1, exerciseId })
    let active = await user.query(api.workouts.getActive, {})
    const we = active!.exercises[0].workoutExerciseId
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id,
      weightKg: 100,
      reps: 5,
      completed: true,
    })
    await user.mutation(api.workouts.addSet, { workoutExerciseId: we })
    active = await user.query(api.workouts.getActive, {})
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[1]._id,
      weightKg: 105,
      reps: 3,
      completed: true,
    })
    await user.mutation(api.workouts.finish, { workoutId: w1 })

    // Routine wants 3 sets of that exercise.
    const routineId = await user.mutation(api.routines.create, {
      name: 'Push',
      exercises: [{ exerciseId, targetSets: 3 }],
    })
    await user.mutation(api.routines.startFromRoutine, { routineId })

    const fresh = await user.query(api.workouts.getActive, {})
    const sets = fresh!.exercises[0].sets
    expect(sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [100, 5],
      [105, 3],
      [105, 3], // extra target set copies the final historical set
    ])
    expect(sets.every((s) => !s.completed)).toBe(true)
  })

  it('starts with empty sets when there is no history', async () => {
    const { user, exerciseId } = await oneUser()
    const routineId = await user.mutation(api.routines.create, {
      name: 'Fresh',
      exercises: [{ exerciseId, targetSets: 2 }],
    })
    await user.mutation(api.routines.startFromRoutine, { routineId })

    const active = await user.query(api.workouts.getActive, {})
    expect(active!.exercises[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([
      [0, 0],
      [0, 0],
    ])
  })

  it('refuses while another workout is active', async () => {
    const { user, exerciseId } = await oneUser()
    const routineId = await user.mutation(api.routines.create, {
      name: 'Push',
      exercises: [{ exerciseId, targetSets: 1 }],
    })
    await user.mutation(api.workouts.start, {})

    await expect(
      user.mutation(api.routines.startFromRoutine, { routineId }),
    ).rejects.toThrow(/finish your current workout/i)
  })
})

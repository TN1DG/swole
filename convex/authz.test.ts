import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  type T,
} from './test.helpers'

// The security matrix: prove that a signed-out visitor gets nothing and
// that user B can neither see nor touch user A's data through ANY function.

async function twoUsers() {
  const t = createBackend()
  const exerciseId = await createBuiltInExercise(t)
  const alice = asUser(t, await createUser(t, 'alice'))
  const bob = asUser(t, await createUser(t, 'bob'))
  return { t, exerciseId, alice, bob }
}

// Alice starts a workout containing one exercise + one set; returns all ids.
async function aliceStartsWorkout(
  alice: ReturnType<typeof asUser>,
  exerciseId: Awaited<ReturnType<typeof createBuiltInExercise>>,
) {
  const workoutId = await alice.mutation(api.workouts.start, {})
  await alice.mutation(api.workouts.addExercise, { workoutId, exerciseId })
  const active = await alice.query(api.workouts.getActive, {})
  return {
    workoutId,
    workoutExerciseId: active!.exercises[0].workoutExerciseId,
    setId: active!.exercises[0].sets[0]._id,
  }
}

describe('unauthenticated access', () => {
  it('queries return nothing', async () => {
    const t: T = createBackend()
    expect(await t.query(api.workouts.getActive, {})).toBeNull()
    expect(await t.query(api.exercises.list, {})).toEqual([])
    expect(await t.query(api.prs.listMine, {})).toEqual([])
    expect(await t.query(api.routines.list, {})).toEqual([])
    const page = await t.query(api.history.listCompleted, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(page.page).toEqual([])
  })

  it('mutations throw', async () => {
    const t: T = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    await expect(t.mutation(api.workouts.start, {})).rejects.toThrow(/not signed in/i)
    await expect(
      t.mutation(api.exercises.create, { name: 'X', muscleGroup: 'Chest' }),
    ).rejects.toThrow(/not signed in/i)
    await expect(
      t.mutation(api.routines.create, {
        name: 'X',
        exercises: [{ exerciseId, targetSets: 3 }],
      }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('cross-user isolation (bob vs alice)', () => {
  it("bob cannot see alice's active workout", async () => {
    const { alice, bob, exerciseId } = await twoUsers()
    await aliceStartsWorkout(alice, exerciseId)
    expect(await bob.query(api.workouts.getActive, {})).toBeNull()
  })

  it("bob cannot read alice's workout detail", async () => {
    const { alice, bob, exerciseId } = await twoUsers()
    const { workoutId } = await aliceStartsWorkout(alice, exerciseId)
    expect(await bob.query(api.history.getDetail, { workoutId })).toBeNull()
  })

  it("bob cannot mutate alice's workout, exercises, or sets", async () => {
    const { alice, bob, exerciseId } = await twoUsers()
    const { workoutId, workoutExerciseId, setId } = await aliceStartsWorkout(
      alice,
      exerciseId,
    )

    await expect(
      bob.mutation(api.workouts.updateSet, { setId, weightKg: 1, reps: 1 }),
    ).rejects.toThrow(/not found/i)
    await expect(bob.mutation(api.workouts.removeSet, { setId })).rejects.toThrow(
      /not found/i,
    )
    await expect(
      bob.mutation(api.workouts.addSet, { workoutExerciseId }),
    ).rejects.toThrow(/not found/i)
    await expect(
      bob.mutation(api.workouts.removeExercise, { workoutExerciseId }),
    ).rejects.toThrow(/not found/i)
    await expect(
      bob.mutation(api.workouts.addExercise, { workoutId, exerciseId }),
    ).rejects.toThrow(/not found/i)
    await expect(
      bob.mutation(api.workouts.rename, { workoutId, name: 'Hacked' }),
    ).rejects.toThrow(/not found/i)
    await expect(bob.mutation(api.workouts.finish, { workoutId })).rejects.toThrow(
      /not found/i,
    )
    await expect(bob.mutation(api.workouts.cancel, { workoutId })).rejects.toThrow(
      /not found/i,
    )
    await expect(
      bob.mutation(api.history.deleteWorkout, { workoutId }),
    ).rejects.toThrow(/not found/i)
  })

  it("bob cannot see or edit alice's custom exercises", async () => {
    const { alice, bob } = await twoUsers()
    const customId = await alice.mutation(api.exercises.create, {
      name: 'Alice Special Press',
      muscleGroup: 'Chest',
      equipment: 'Machine',
    })

    const bobList = await bob.query(api.exercises.list, {})
    expect(bobList.some((ex) => ex._id === customId)).toBe(false)

    await expect(
      bob.mutation(api.exercises.update, {
        id: customId,
        name: 'Hacked',
        muscleGroup: 'Chest',
      }),
    ).rejects.toThrow(/not found/i)
  })

  it("bob cannot see alice's history, PRs, or exercise progress", async () => {
    const { alice, bob, exerciseId } = await twoUsers()
    const { workoutId, setId } = await aliceStartsWorkout(alice, exerciseId)
    await alice.mutation(api.workouts.updateSet, {
      setId,
      weightKg: 100,
      reps: 5,
      completed: true,
    })
    await alice.mutation(api.workouts.finish, { workoutId })

    expect(await bob.query(api.prs.listMine, {})).toEqual([])
    expect(await bob.query(api.history.exerciseHistory, { exerciseId })).toEqual([])
    const bobPage = await bob.query(api.history.listCompleted, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(bobPage.page).toEqual([])
  })

  it("bob cannot use or modify alice's routines", async () => {
    const { alice, bob, exerciseId } = await twoUsers()
    const routineId = await alice.mutation(api.routines.create, {
      name: 'Push Day',
      exercises: [{ exerciseId, targetSets: 3 }],
    })

    expect(await bob.query(api.routines.list, {})).toEqual([])
    await expect(
      bob.mutation(api.routines.startFromRoutine, { routineId }),
    ).rejects.toThrow(/not found/i)
    await expect(
      bob.mutation(api.routines.update, {
        routineId,
        name: 'Hacked',
        exercises: [{ exerciseId, targetSets: 1 }],
      }),
    ).rejects.toThrow(/not found/i)
    await expect(bob.mutation(api.routines.remove, { routineId })).rejects.toThrow(
      /not found/i,
    )
  })
})

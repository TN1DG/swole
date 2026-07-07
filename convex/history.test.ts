import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { epley1rm } from './fitness'
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

type User = Awaited<ReturnType<typeof oneUser>>['user']
type ExerciseId = Awaited<ReturnType<typeof oneUser>>['exerciseId']

// One-exercise workout with a single completed set, finished immediately.
async function finishedWorkout(
  user: User,
  exerciseId: ExerciseId,
  weightKg: number,
  reps: number,
) {
  const workoutId = await user.mutation(api.workouts.start, {})
  await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
  const active = await user.query(api.workouts.getActive, {})
  await user.mutation(api.workouts.updateSet, {
    setId: active!.exercises[0].sets[0]._id,
    weightKg,
    reps,
    completed: true,
  })
  await user.mutation(api.workouts.finish, { workoutId })
  return workoutId
}

describe('deleteWorkout record recomputation', () => {
  it('falls back to the older best when the record workout is deleted', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await finishedWorkout(user, exerciseId, 100, 5)
    const w2 = await finishedWorkout(user, exerciseId, 110, 3)

    let [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(110)
    expect(record.workoutId).toBe(w2)

    await user.mutation(api.history.deleteWorkout, { workoutId: w2 })

    ;[record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(100)
    expect(record.bestWeightReps).toBe(5)
    expect(record.bestEst1rm).toBeCloseTo(epley1rm(100, 5), 5)
    expect(record.workoutId).toBe(w1)
  })

  it('removes the record entirely when no history remains', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await finishedWorkout(user, exerciseId, 100, 5)
    await user.mutation(api.history.deleteWorkout, { workoutId: w1 })

    expect(await user.query(api.prs.listMine, {})).toEqual([])
    expect(await user.query(api.history.getDetail, { workoutId: w1 })).toBeNull()
  })
})

describe('listCompleted pagination', () => {
  it('pages newest-first and terminates', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await finishedWorkout(user, exerciseId, 100, 5)
    const w2 = await finishedWorkout(user, exerciseId, 101, 5)
    const w3 = await finishedWorkout(user, exerciseId, 102, 5)

    const first = await user.query(api.history.listCompleted, {
      paginationOpts: { numItems: 2, cursor: null },
    })
    expect(first.page.map((w) => w._id)).toEqual([w3, w2])
    expect(first.isDone).toBe(false)

    const second = await user.query(api.history.listCompleted, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    })
    expect(second.page.map((w) => w._id)).toEqual([w1])
    expect(second.isDone).toBe(true)
  })

  it('excludes the in-progress workout and computes card stats', async () => {
    const { user, exerciseId } = await oneUser()
    await finishedWorkout(user, exerciseId, 100, 5)
    await user.mutation(api.workouts.start, {}) // active, must not appear

    const { page } = await user.query(api.history.listCompleted, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(page).toHaveLength(1)
    expect(page[0].totalVolumeKg).toBe(500)
    expect(page[0].setCount).toBe(1)
    expect(page[0].exercises).toEqual([{ name: 'Bench Press', setCount: 1 }])
  })
})

describe('exerciseHistory', () => {
  it('returns sessions oldest-first with top set and volume', async () => {
    const { user, exerciseId } = await oneUser()
    await finishedWorkout(user, exerciseId, 100, 5)
    await finishedWorkout(user, exerciseId, 105, 3)

    const sessions = await user.query(api.history.exerciseHistory, { exerciseId })
    expect(sessions).toHaveLength(2)
    expect(sessions[0].topWeightKg).toBe(100)
    expect(sessions[1].topWeightKg).toBe(105)
    expect(sessions[0].volumeKg).toBe(500)
    expect(sessions[1].bestE1rm).toBeCloseTo(epley1rm(105, 3), 5)
  })

  it('ignores other exercises', async () => {
    const { t, user, exerciseId } = await oneUser()
    const otherId = await createBuiltInExercise(t as T, 'Squat')
    await finishedWorkout(user, exerciseId, 100, 5)

    expect(await user.query(api.history.exerciseHistory, { exerciseId: otherId })).toEqual(
      [],
    )
  })
})

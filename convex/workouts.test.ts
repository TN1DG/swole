import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { epley1rm } from './fitness'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
} from './test.helpers'

async function oneUser() {
  const t = createBackend()
  const exerciseId = await createBuiltInExercise(t)
  const user = asUser(t, await createUser(t, 'alice'))
  return { t, user, exerciseId }
}

type User = Awaited<ReturnType<typeof oneUser>>['user']
type ExerciseId = Awaited<ReturnType<typeof oneUser>>['exerciseId']

// Start a workout, log the given sets on one exercise, return ids.
// Each set: [weightKg, reps, completed, isWarmup?]
async function logWorkout(
  user: User,
  exerciseId: ExerciseId,
  sets: [number, number, boolean, boolean?][],
) {
  const workoutId = await user.mutation(api.workouts.start, {})
  await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
  const active = await user.query(api.workouts.getActive, {})
  const workoutExerciseId = active!.exercises[0].workoutExerciseId

  // addExercise created set #1; add the rest.
  for (let i = 1; i < sets.length; i++) {
    await user.mutation(api.workouts.addSet, { workoutExerciseId })
  }
  const refreshed = await user.query(api.workouts.getActive, {})
  const setIds = refreshed!.exercises[0].sets.map((s) => s._id)

  for (const [i, [weightKg, reps, completed, isWarmup]] of sets.entries()) {
    await user.mutation(api.workouts.updateSet, {
      setId: setIds[i],
      weightKg,
      reps,
      completed,
      ...(isWarmup ? { isWarmup } : {}),
    })
  }
  return { workoutId, workoutExerciseId, setIds }
}

describe('finish', () => {
  it('discards incomplete sets and computes summary', async () => {
    const { user, exerciseId } = await oneUser()
    const { workoutId } = await logWorkout(user, exerciseId, [
      [60, 5, true, true], // completed warm-up
      [100, 5, true], // completed working set
      [110, 1, false], // never completed -> discarded
    ])

    const summary = await user.mutation(api.workouts.finish, { workoutId })
    expect(summary.discarded).toBe(false)
    if (summary.discarded) throw new Error('unreachable')

    // Volume excludes the warm-up; set count includes it; incomplete gone.
    expect(summary.totalVolumeKg).toBe(500)
    expect(summary.completedSetCount).toBe(2)
    expect(summary.exerciseCount).toBe(1)

    const detail = await user.query(api.history.getDetail, { workoutId })
    expect(detail!.exercises[0].sets).toHaveLength(2)
  })

  it('discards the whole workout when nothing was completed', async () => {
    const { user, exerciseId } = await oneUser()
    const { workoutId } = await logWorkout(user, exerciseId, [[100, 5, false]])

    const summary = await user.mutation(api.workouts.finish, { workoutId })
    expect(summary.discarded).toBe(true)
    expect(await user.query(api.history.getDetail, { workoutId })).toBeNull()
  })

  it('cannot finish twice or edit a finished workout', async () => {
    const { user, exerciseId } = await oneUser()
    const { workoutId, workoutExerciseId, setIds } = await logWorkout(
      user,
      exerciseId,
      [[100, 5, true]],
    )
    await user.mutation(api.workouts.finish, { workoutId })

    await expect(user.mutation(api.workouts.finish, { workoutId })).rejects.toThrow(
      /already finished/i,
    )
    // History is immutable: no set/exercise mutations on a finished workout.
    await expect(
      user.mutation(api.workouts.updateSet, { setId: setIds[0], weightKg: 999 }),
    ).rejects.toThrow(/already finished/i)
    await expect(
      user.mutation(api.workouts.addSet, { workoutExerciseId }),
    ).rejects.toThrow(/already finished/i)
    await expect(
      user.mutation(api.workouts.addExercise, { workoutId, exerciseId }),
    ).rejects.toThrow(/already finished/i)
    await expect(user.mutation(api.workouts.cancel, { workoutId })).rejects.toThrow(
      /already finished/i,
    )
  })
})

describe('personal records', () => {
  it('first workout sets the first record', async () => {
    const { user, exerciseId } = await oneUser()
    const { workoutId } = await logWorkout(user, exerciseId, [[100, 5, true]])
    const summary = await user.mutation(api.workouts.finish, { workoutId })

    expect(summary.discarded === false && summary.prCount).toBe(1)
    const [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(100)
    expect(record.bestWeightReps).toBe(5)
    expect(record.bestEst1rm).toBeCloseTo(epley1rm(100, 5), 5)
  })

  it('heavier weight beats the record; est-1RM from the old set survives', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await logWorkout(user, exerciseId, [[100, 5, true]])
    await user.mutation(api.workouts.finish, { workoutId: w1.workoutId })

    const w2 = await logWorkout(user, exerciseId, [[102.5, 3, true]])
    const summary = await user.mutation(api.workouts.finish, { workoutId: w2.workoutId })

    expect(summary.discarded === false && summary.prCount).toBe(1)
    const [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(102.5)
    expect(record.bestWeightReps).toBe(3)
    // 102.5x3 has a LOWER est 1RM than 100x5 — the old 1RM must be kept.
    expect(record.bestEst1rm).toBeCloseTo(epley1rm(100, 5), 5)
  })

  it('more reps at the same weight is an est-1RM PR; best weight survives', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await logWorkout(user, exerciseId, [[102.5, 3, true]])
    await user.mutation(api.workouts.finish, { workoutId: w1.workoutId })

    const w2 = await logWorkout(user, exerciseId, [[100, 8, true]])
    const summary = await user.mutation(api.workouts.finish, { workoutId: w2.workoutId })

    expect(summary.discarded === false && summary.prCount).toBe(1)
    const [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(102.5) // kept
    expect(record.bestEst1rm).toBeCloseTo(epley1rm(100, 8), 5)
  })

  it('a lighter session is not a PR', async () => {
    const { user, exerciseId } = await oneUser()
    const w1 = await logWorkout(user, exerciseId, [[100, 5, true]])
    await user.mutation(api.workouts.finish, { workoutId: w1.workoutId })

    const w2 = await logWorkout(user, exerciseId, [[80, 5, true]])
    const summary = await user.mutation(api.workouts.finish, { workoutId: w2.workoutId })

    expect(summary.discarded === false && summary.prCount).toBe(0)
    const [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(100)
  })

  it('warm-up sets never count toward records', async () => {
    const { user, exerciseId } = await oneUser()
    const { workoutId } = await logWorkout(user, exerciseId, [
      [180, 1, true, true], // huge warm-up (mistagged? still: warm-up)
      [100, 5, true],
    ])
    await user.mutation(api.workouts.finish, { workoutId })

    const [record] = await user.query(api.prs.listMine, {})
    expect(record.bestWeightKg).toBe(100)
  })
})

describe('input validation & caps', () => {
  it('rejects NaN, Infinity, negative, and absurd numbers', async () => {
    const { user, exerciseId } = await oneUser()
    const { setIds } = await logWorkout(user, exerciseId, [[100, 5, false]])
    const setId = setIds[0]

    for (const weightKg of [NaN, Infinity, -Infinity, -5, 1e308, 2000]) {
      await expect(
        user.mutation(api.workouts.updateSet, { setId, weightKg }),
      ).rejects.toThrow(/weight/i)
    }
    for (const reps of [NaN, Infinity, -1, 10_000]) {
      await expect(
        user.mutation(api.workouts.updateSet, { setId, reps }),
      ).rejects.toThrow(/reps/i)
    }
    // Sane values still work, fractional reps round.
    await user.mutation(api.workouts.updateSet, { setId, weightKg: 102.5, reps: 7.6 })
    const active = await user.query(api.workouts.getActive, {})
    expect(active!.exercises[0].sets[0].weightKg).toBe(102.5)
    expect(active!.exercises[0].sets[0].reps).toBe(8)
  })

  it('rejects bad exercise fields', async () => {
    const { user } = await oneUser()
    await expect(
      user.mutation(api.exercises.create, { name: '   ', muscleGroup: 'Chest' }),
    ).rejects.toThrow(/name/i)
    await expect(
      user.mutation(api.exercises.create, {
        name: 'x'.repeat(81),
        muscleGroup: 'Chest',
      }),
    ).rejects.toThrow(/too long/i)
    await expect(
      user.mutation(api.exercises.create, { name: 'Wing Flap', muscleGroup: 'Wings' }),
    ).rejects.toThrow(/muscle group/i)
    await expect(
      user.mutation(api.exercises.create, {
        name: 'Laser Row',
        muscleGroup: 'Back',
        equipment: 'Laser',
      }),
    ).rejects.toThrow(/equipment/i)
  })

  it('rejects invalid localHour', async () => {
    const { user } = await oneUser()
    await expect(
      user.mutation(api.workouts.start, { localHour: 99 }),
    ).rejects.toThrow(/localHour/i)
  })

  it('caps sets per exercise at 30', async () => {
    const { user, exerciseId } = await oneUser()
    const workoutId = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    const active = await user.query(api.workouts.getActive, {})
    const workoutExerciseId = active!.exercises[0].workoutExerciseId

    for (let i = 1; i < 30; i++) {
      await user.mutation(api.workouts.addSet, { workoutExerciseId })
    }
    await expect(
      user.mutation(api.workouts.addSet, { workoutExerciseId }),
    ).rejects.toThrow(/max 30 sets/i)
  })

  it('caps exercises per workout at 30', async () => {
    const { user, exerciseId } = await oneUser()
    const workoutId = await user.mutation(api.workouts.start, {})
    for (let i = 0; i < 30; i++) {
      await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    }
    await expect(
      user.mutation(api.workouts.addExercise, { workoutId, exerciseId }),
    ).rejects.toThrow(/max 30 exercises/i)
  })
})

describe('misc lifecycle', () => {
  it('start is idempotent while a workout is active', async () => {
    const { user } = await oneUser()
    const first = await user.mutation(api.workouts.start, {})
    const second = await user.mutation(api.workouts.start, {})
    expect(second).toBe(first)
  })

  it('the same exercise twice in one workout aggregates into one record', async () => {
    const { user, exerciseId } = await oneUser()
    const workoutId = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    const active = await user.query(api.workouts.getActive, {})

    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id,
      weightKg: 100,
      reps: 5,
      completed: true,
    })
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[1].sets[0]._id,
      weightKg: 105,
      reps: 3,
      completed: true,
    })
    const summary = await user.mutation(api.workouts.finish, { workoutId })

    // One PR counted per improvement pass, records reflect the best of both.
    expect(summary.discarded).toBe(false)
    const records = await user.query(api.prs.listMine, {})
    expect(records).toHaveLength(1)
    expect(records[0].bestWeightKg).toBe(105)
    expect(records[0].bestEst1rm).toBeCloseTo(epley1rm(100, 5), 5)
  })
})

import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  logWorkoutOn,
  type T,
} from './test.helpers'

async function finishedWorkout(t: T) {
  const exerciseId = await createBuiltInExercise(t)
  const user = asUser(t, await createUser(t, 'alice'))
  const workoutId = await logWorkoutOn(t, user, exerciseId)
  return { user, workoutId }
}

describe('submit', () => {
  it('saves the selected reasons and note', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await user.mutation(api.workoutFeedback.submit, {
      workoutId,
      reasons: ['More energy', 'Clearer plan'],
      note: 'Gym was crowded',
    })

    const row = await t.run(async (ctx) =>
      ctx.db
        .query('workoutFeedback')
        .withIndex('by_workout', (q) => q.eq('workoutId', workoutId))
        .unique(),
    )
    expect(row?.reasons).toEqual(['More energy', 'Clearer plan'])
    expect(row?.note).toBe('Gym was crowded')
  })

  it('drops reasons that are not in REASON_OPTIONS', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await user.mutation(api.workoutFeedback.submit, {
      workoutId,
      reasons: ['More energy', 'made up reason'],
    })

    const row = await t.run(async (ctx) =>
      ctx.db
        .query('workoutFeedback')
        .withIndex('by_workout', (q) => q.eq('workoutId', workoutId))
        .unique(),
    )
    expect(row?.reasons).toEqual(['More energy'])
  })

  it('rejects an empty submission (no reasons, no note)', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await expect(
      user.mutation(api.workoutFeedback.submit, { workoutId, reasons: [] }),
    ).rejects.toThrow(/add a reason or a note/i)
  })

  it('rejects a whitespace-only note with no reasons', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await expect(
      user.mutation(api.workoutFeedback.submit, { workoutId, reasons: [], note: '   ' }),
    ).rejects.toThrow(/add a reason or a note/i)
  })

  it('rejects a note over the length cap', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await expect(
      user.mutation(api.workoutFeedback.submit, {
        workoutId,
        reasons: [],
        note: 'x'.repeat(301),
      }),
    ).rejects.toThrow(/too long/i)
  })

  it('rejects a second submission for the same workout', async () => {
    const t = createBackend()
    const { user, workoutId } = await finishedWorkout(t)

    await user.mutation(api.workoutFeedback.submit, { workoutId, reasons: ['More energy'] })

    await expect(
      user.mutation(api.workoutFeedback.submit, { workoutId, reasons: ['More time'] }),
    ).rejects.toThrow(/already submitted/i)
  })

  it("rejects feedback on someone else's workout", async () => {
    const t = createBackend()
    const { workoutId } = await finishedWorkout(t)
    const bob = asUser(t, await createUser(t, 'bob'))

    await expect(
      bob.mutation(api.workoutFeedback.submit, { workoutId, reasons: ['More energy'] }),
    ).rejects.toThrow(/not found/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const { workoutId } = await finishedWorkout(t)

    await expect(
      t.mutation(api.workoutFeedback.submit, { workoutId, reasons: ['More energy'] }),
    ).rejects.toThrow(/not signed in/i)
  })
})

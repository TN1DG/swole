import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { DAY_MS, epley1rm, utcWeekStart, weeklyPoints } from './fitness'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  logWorkoutOn,
  pointsOf,
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

describe('listForCalendar', () => {
  it('returns only completed workouts within [startMs, endMs)', async () => {
    const { t, user, exerciseId } = await oneUser()
    const inRange = await finishedWorkout(user, exerciseId, 100, 5)
    const outOfRange = await finishedWorkout(user, exerciseId, 100, 5)

    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.patch(inRange, { startedAt: now, endedAt: now })
      // Well before the range being queried below.
      await ctx.db.patch(outOfRange, { startedAt: now - 30 * 24 * 60 * 60 * 1000 })
    })

    const results = await user.query(api.history.listForCalendar, {
      startMs: now - 1000,
      endMs: now + 1000,
    })
    expect(results.map((w) => w._id)).toEqual([inRange])
  })

  it('excludes the active (unfinished) workout', async () => {
    const { user } = await oneUser()
    const now = Date.now()
    await user.mutation(api.workouts.start, {}) // never finished

    const results = await user.query(api.history.listForCalendar, {
      startMs: now - 1000,
      endMs: now + 1000,
    })
    expect(results).toEqual([])
  })

  it('rejects an oversized range', async () => {
    const { user } = await oneUser()
    const now = Date.now()
    await expect(
      user.query(api.history.listForCalendar, {
        startMs: now,
        endMs: now + 60 * 24 * 60 * 60 * 1000, // 60 days, over the ~40-day cap
      }),
    ).rejects.toThrow(/invalid range/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const now = Date.now()
    expect(
      await t.query(api.history.listForCalendar, { startMs: now, endMs: now + 1000 }),
    ).toEqual([])
  })
})

// The "conquered" red slash (see getDetail's eligibleRecords + fitness.ts's
// behindRecord): a record may only be measured against the workout that set
// it and workouts logged afterwards — never against earlier history.
describe('getDetail eligibleRecords', () => {
  it('exposes the record to the workout that set it', async () => {
    const { user, exerciseId } = await oneUser()
    const workoutId = await finishedWorkout(user, exerciseId, 100, 5)

    const detail = await user.query(api.history.getDetail, { workoutId })
    expect(detail!.eligibleRecords).toEqual([
      { exerciseId, bestWeightKg: 100, bestEst1rm: epley1rm(100, 5) },
    ])
  })

  it('exposes a later PR to workouts logged after it, but not before it', async () => {
    const { t, user, exerciseId } = await oneUser()
    const older = await finishedWorkout(user, exerciseId, 100, 5)
    const prWorkout = await finishedWorkout(user, exerciseId, 140, 5)

    // The PR's achievedAt is stamped at finish time. Push the older workout
    // firmly into the past so it is unambiguously "before" that.
    const [record] = await user.query(api.prs.listMine, {})
    expect(record.workoutId).toBe(prWorkout)
    await t.run(async (ctx) => {
      await ctx.db.patch(older, { startedAt: record.achievedAt - 60_000 })
    })

    // Earlier workout: nothing to measure against — no slash rewriting history.
    const olderDetail = await user.query(api.history.getDetail, { workoutId: older })
    expect(olderDetail!.eligibleRecords).toEqual([])

    // A workout logged after the PR is measured against it.
    const newer = await finishedWorkout(user, exerciseId, 90, 5)
    const newerDetail = await user.query(api.history.getDetail, { workoutId: newer })
    expect(newerDetail!.eligibleRecords).toEqual([
      { exerciseId, bestWeightKg: 140, bestEst1rm: epley1rm(140, 5) },
    ])
  })
})

describe('deleteWorkout points clawback', () => {
  // Monday noon of the current week, so a whole week's days are addressable.
  const day = (n: number) => utcWeekStart(Date.now()) + n * DAY_MS + 12 * 3600_000

  async function setup() {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const userId = await createUser(t, 'alice')
    return { t, exerciseId, userId, user: asUser(t, userId) }
  }

  it('returns the balance to zero when the week has nothing left', async () => {
    const { t, user, exerciseId, userId } = await setup()
    const workoutId = await logWorkoutOn(t, user, exerciseId, { startedAt: day(0) })
    expect(await pointsOf(t, userId)).toBeGreaterThan(0)

    await user.mutation(api.history.deleteWorkout, { workoutId })
    expect(await pointsOf(t, userId)).toBe(0)
  })

  it('re-prices the survivors when an earlier day is removed', async () => {
    // Removing day 1 of a three-day week moves days 2 and 3 back down the
    // curve, so it is not enough to subtract what the deleted row awarded.
    const { t, user, exerciseId, userId } = await setup()
    const first = await logWorkoutOn(t, user, exerciseId, { startedAt: day(0) })
    await logWorkoutOn(t, user, exerciseId, { startedAt: day(1) })
    await logWorkoutOn(t, user, exerciseId, { startedAt: day(2) })

    await user.mutation(api.history.deleteWorkout, { workoutId: first })

    const balance = await pointsOf(t, userId)
    const survivors = await t.run(async (ctx) =>
      ctx.db
        .query('workouts')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .collect(),
    )
    expect(survivors).toHaveLength(2)

    // The telescoping invariant: the stamped awards still sum to the balance.
    const stamped = survivors.reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)
    expect(stamped).toBe(balance)
    // prCount is 0, not 1: the PR belonged to the workout that was deleted,
    // and prCount is stamped per workout at finish time.
    expect(balance).toBe(
      weeklyPoints({ daysTrained: 2, volumeKg: 1000, prCount: 0, streakWeeks: 1 }),
    )
  })

  it('makes delete-and-relog worth nothing', async () => {
    // Without a clawback this loop is a points printer.
    const { t, user, exerciseId, userId } = await setup()
    await logWorkoutOn(t, user, exerciseId, { startedAt: day(0) })
    const before = await pointsOf(t, userId)

    for (let i = 0; i < 3; i++) {
      const extra = await logWorkoutOn(t, user, exerciseId, { startedAt: day(0) })
      await user.mutation(api.history.deleteWorkout, { workoutId: extra })
    }

    expect(await pointsOf(t, userId)).toBe(before)
  })

  it('floors the clawback at zero when the points are already spent', async () => {
    const { t, user, exerciseId, userId } = await setup()
    const workoutId = await logWorkoutOn(t, user, exerciseId, { startedAt: day(0) })

    // Simulate the balance being escrowed into a live challenge.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique()
      await ctx.db.patch(profile!._id, { pointsBalance: 0 })
    })

    // Deleting must still succeed rather than failing an unexplainable
    // "insufficient points" error at the user.
    await user.mutation(api.history.deleteWorkout, { workoutId })
    expect(await pointsOf(t, userId)).toBe(0)
  })
})

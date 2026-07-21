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

describe('favorites', () => {
  it('toggles on then off', async () => {
    const { user, exerciseId } = await oneUser()

    expect(await user.query(api.favorites.isFavorited, { exerciseId })).toBe(false)
    expect(await user.mutation(api.favorites.toggle, { exerciseId })).toBe(true)
    expect(await user.query(api.favorites.isFavorited, { exerciseId })).toBe(true)
    expect(await user.query(api.favorites.myFavoriteIds, {})).toEqual([exerciseId])

    expect(await user.mutation(api.favorites.toggle, { exerciseId })).toBe(false)
    expect(await user.query(api.favorites.isFavorited, { exerciseId })).toBe(false)
    expect(await user.query(api.favorites.myFavoriteIds, {})).toEqual([])
  })

  it('listMine joins the exercise and its PR', async () => {
    const { user, exerciseId } = await oneUser()
    await user.mutation(api.favorites.toggle, { exerciseId })

    let [fav] = await user.query(api.favorites.listMine, {})
    expect(fav.exercise._id).toBe(exerciseId)
    expect(fav.record).toBeNull()

    // Log a PR, then the same favorite should carry it.
    const workoutId = await user.mutation(api.workouts.start, {})
    await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })
    const active = await user.query(api.workouts.getActive, {})
    await user.mutation(api.workouts.updateSet, {
      setId: active!.exercises[0].sets[0]._id,
      weightKg: 100,
      reps: 5,
      completed: true,
    })
    await user.mutation(api.workouts.finish, { workoutId })

    ;[fav] = await user.query(api.favorites.listMine, {})
    expect(fav.record?.bestWeightKg).toBe(100)
  })

  it('rejects favoriting an exercise that does not exist', async () => {
    const { t, user, exerciseId } = await oneUser()
    // Delete the exercise out from under the id to get a dangling id.
    await t.run(async (ctx) => ctx.db.delete(exerciseId))
    await expect(
      user.mutation(api.favorites.toggle, { exerciseId }),
    ).rejects.toThrow(/not found/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    expect(await t.query(api.favorites.myFavoriteIds, {})).toEqual([])
    expect(await t.query(api.favorites.isFavorited, { exerciseId })).toBe(false)
    expect(await t.query(api.favorites.listMine, {})).toEqual([])
    await expect(
      t.mutation(api.favorites.toggle, { exerciseId }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('cross-user isolation', () => {
  it("bob cannot favorite alice's custom exercise, and lists stay separate", async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))
    const builtIn = await createBuiltInExercise(t as T)

    const aliceCustomId = await alice.mutation(api.exercises.create, {
      name: 'Alice Special Press',
      muscleGroup: 'Chest',
      equipment: 'Machine',
    })

    await expect(
      bob.mutation(api.favorites.toggle, { exerciseId: aliceCustomId }),
    ).rejects.toThrow(/not found/i)

    // Built-ins are fair game for anyone, and each user's list stays their own.
    await alice.mutation(api.favorites.toggle, { exerciseId: builtIn })
    await bob.mutation(api.favorites.toggle, { exerciseId: builtIn })
    expect(await alice.query(api.favorites.myFavoriteIds, {})).toEqual([builtIn])
    expect(await bob.query(api.favorites.myFavoriteIds, {})).toEqual([builtIn])

    await bob.mutation(api.favorites.toggle, { exerciseId: builtIn })
    expect(await bob.query(api.favorites.myFavoriteIds, {})).toEqual([])
    expect(await alice.query(api.favorites.myFavoriteIds, {})).toEqual([builtIn])
  })
})

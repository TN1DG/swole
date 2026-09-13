import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { asUser, createBackend, createUser } from './test.helpers'
import { SEED_FOODS } from './foodSeedData'

describe('foods.seed', () => {
  it('inserts the seed data', async () => {
    const t = createBackend()

    const result = await t.mutation(internal.foods.seed, {})

    expect(result).toBe(`Seeded ${SEED_FOODS.length} foods.`)
  })

  it('is idempotent — a second call is a no-op', async () => {
    const t = createBackend()

    await t.mutation(internal.foods.seed, {})
    const second = await t.mutation(internal.foods.seed, {})

    expect(second).toBe('Already seeded — skipped.')
  })
})

describe('foods.list', () => {
  it('returns the seeded foods to a signed-in user', async () => {
    const t = createBackend()
    await t.mutation(internal.foods.seed, {})
    const user = asUser(t, await createUser(t, 'alice'))

    const foods = await user.query(api.foods.list, {})

    expect(foods).toHaveLength(SEED_FOODS.length)
    expect(foods[0]).toMatchObject({
      name: expect.any(String),
      calories: expect.any(Number),
      proteinG: expect.any(Number),
    })
  })

  it('returns nothing when signed out', async () => {
    const t = createBackend()
    await t.mutation(internal.foods.seed, {})

    expect(await t.query(api.foods.list, {})).toEqual([])
  })
})

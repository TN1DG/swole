import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { asUser, createBackend, createUser } from './test.helpers'
import { ALL_SEED_FOODS } from './foods'

describe('foods.seed', () => {
  it('inserts the seed data', async () => {
    const t = createBackend()

    const result = await t.mutation(internal.foods.seed, {})

    expect(result).toBe(`Seeded ${ALL_SEED_FOODS.length} foods.`)
  })

  it('is idempotent — a second call is a no-op', async () => {
    const t = createBackend()

    await t.mutation(internal.foods.seed, {})
    const second = await t.mutation(internal.foods.seed, {})

    expect(second).toBe('Already seeded — skipped.')
  })

  // A deployment seeded before the regional foods existed must still get them.
  it('adds only the foods that are missing, keeping existing rows', async () => {
    const t = createBackend()
    const keptId = await t.run(async (ctx) =>
      ctx.db.insert('foodDatabase', ALL_SEED_FOODS[0]!),
    )

    const result = await t.mutation(internal.foods.seed, {})

    expect(result).toBe(`Seeded ${ALL_SEED_FOODS.length - 1} foods.`)
    const rows = await t.run(async (ctx) => ctx.db.query('foodDatabase').collect())
    expect(rows).toHaveLength(ALL_SEED_FOODS.length)
    expect(rows.some((r) => r._id === keptId)).toBe(true)
  })

  it('has no duplicate names across the original and regional lists', () => {
    const names = ALL_SEED_FOODS.map((f) => f.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes the African, Caribbean and Asian additions', () => {
    const names = new Set(ALL_SEED_FOODS.map((f) => f.name))
    for (const name of ['Jollof Rice (100g)', 'Egusi Stew (100g)', 'Ackee and Saltfish (100g)', 'Koshari (1 serving)', 'Butter Chicken (100g)']) {
      expect(names).toContain(name)
    }
  })
})

describe('foods.list', () => {
  it('returns the seeded foods to a signed-in user', async () => {
    const t = createBackend()
    await t.mutation(internal.foods.seed, {})
    const user = asUser(t, await createUser(t, 'alice'))

    const foods = await user.query(api.foods.list, {})

    expect(foods).toHaveLength(ALL_SEED_FOODS.length)
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

import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import { asUser, createBackend, createUser } from './test.helpers'
import { ALL_SEED_FOODS } from './foods'

describe('seed.seedAll', () => {
  it('seeds every table and is idempotent', async () => {
    const t = createBackend()

    const first = await t.mutation(internal.seed.seedAll, {})
    expect(first[0]).toMatch(/^Seeded \d+ exercises\.$/)
    expect(first[1]).toBe(`Seeded ${ALL_SEED_FOODS.length} foods.`)

    const second = await t.mutation(internal.seed.seedAll, {})
    expect(second).toEqual(['Already seeded — skipped.', 'Already seeded — skipped.'])

    const user = asUser(t, await createUser(t, 'alice'))
    expect(await user.query(api.foods.list, {})).toHaveLength(ALL_SEED_FOODS.length)
    expect((await user.query(api.exercises.list, {})).length).toBeGreaterThan(0)
  })
})

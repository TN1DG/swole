import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { asUser, createBackend, createUser, type T } from './test.helpers'

describe('profiles', () => {
  it('defaults before any profile row exists', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({
      email: 'alice@test.local',
      displayName: null,
      unitPreference: 'kg',
      workoutCount: 0,
      prCount: 0,
      favoriteCount: 0,
    })
  })

  it('sets and clears the display name', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.updateDisplayName, { displayName: '  Alice  ' })
    expect((await user.query(api.profiles.getMine, {}))!.displayName).toBe('Alice')

    await user.mutation(api.profiles.updateDisplayName, { displayName: '   ' })
    expect((await user.query(api.profiles.getMine, {}))!.displayName).toBeNull()
  })

  it('rejects an overly long display name', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await expect(
      user.mutation(api.profiles.updateDisplayName, { displayName: 'x'.repeat(41) }),
    ).rejects.toThrow(/too long/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    expect(await t.query(api.profiles.getMine, {})).toBeNull()
    await expect(
      t.mutation(api.profiles.updateDisplayName, { displayName: 'X' }),
    ).rejects.toThrow(/not signed in/i)
  })

  it("bob's profile is unaffected by alice's edits", async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))

    await alice.mutation(api.profiles.updateDisplayName, { displayName: 'Alice' })
    const bobProfile = await bob.query(api.profiles.getMine, {})
    expect(bobProfile!.displayName).toBeNull()
    expect(bobProfile!.email).toBe('bob@test.local')
  })
})

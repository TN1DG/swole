import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { utcWeekStart } from './fitness'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  createUser,
  logWorkoutOn,
  type T,
} from './test.helpers'

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

describe('updateBodyStats', () => {
  it('defaults to null before anything is set', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({
      heightCm: null,
      weightKg: null,
      age: null,
      sex: null,
      activityLevel: null,
    })
  })

  it('saves and returns body stats', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.updateBodyStats, {
      heightCm: 180,
      weightKg: 80,
      age: 30,
      sex: 'male',
      activityLevel: 'moderate',
    })

    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({
      heightCm: 180,
      weightKg: 80,
      age: 30,
      sex: 'male',
      activityLevel: 'moderate',
    })
  })

  it('rejects implausible values', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    const valid = {
      heightCm: 180,
      weightKg: 80,
      age: 30,
      sex: 'male' as const,
      activityLevel: 'moderate' as const,
    }

    await expect(
      user.mutation(api.profiles.updateBodyStats, { ...valid, heightCm: 900 }),
    ).rejects.toThrow(/height/i)
    await expect(
      user.mutation(api.profiles.updateBodyStats, { ...valid, weightKg: -5 }),
    ).rejects.toThrow(/weight/i)
    await expect(
      user.mutation(api.profiles.updateBodyStats, { ...valid, age: 3 }),
    ).rejects.toThrow(/age/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.profiles.updateBodyStats, {
        heightCm: 180,
        weightKg: 80,
        age: 30,
        sex: 'male',
        activityLevel: 'moderate',
      }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('saveOnboardingIdentity', () => {
  it('sets username and display name but does not mark onboarded', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.saveOnboardingIdentity, {
      username: 'alice_lifts',
      displayName: 'Alice',
    })

    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({
      username: 'alice_lifts',
      displayName: 'Alice',
      onboarded: false,
    })
  })

  it('rejects a username already taken by someone else', async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))

    await alice.mutation(api.profiles.saveOnboardingIdentity, {
      username: 'sameuser',
      displayName: 'Alice',
    })
    await expect(
      bob.mutation(api.profiles.saveOnboardingIdentity, {
        username: 'sameuser',
        displayName: 'Bob',
      }),
    ).rejects.toThrow(/taken/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.profiles.saveOnboardingIdentity, {
        username: 'alice',
        displayName: 'Alice',
      }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('finishOnboarding', () => {
  it('marks the profile onboarded', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    expect((await user.query(api.profiles.getMine, {}))!.onboarded).toBe(false)
    await user.mutation(api.profiles.finishOnboarding, {})
    expect((await user.query(api.profiles.getMine, {}))!.onboarded).toBe(true)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(t.mutation(api.profiles.finishOnboarding, {})).rejects.toThrow(/not signed in/i)
  })
})

describe('seen tips', () => {
  it('returns no tips seen by default, then records dismissals', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    expect(await user.query(api.profiles.getSeenTips, {})).toEqual([])

    await user.mutation(api.profiles.markTipSeen, { tip: 'workout' })
    await user.mutation(api.profiles.markTipSeen, { tip: 'friends' })
    expect(await user.query(api.profiles.getSeenTips, {})).toEqual(['workout', 'friends'])
  })

  it('is idempotent — marking the same tip twice does not duplicate it', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.markTipSeen, { tip: 'workout' })
    await user.mutation(api.profiles.markTipSeen, { tip: 'workout' })
    expect(await user.query(api.profiles.getSeenTips, {})).toEqual(['workout'])
  })

  it('caps at 20 tips', async () => {
    const t = createBackend()
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    for (let i = 0; i < 20; i++) {
      await user.mutation(api.profiles.markTipSeen, { tip: `tip-${i}` })
    }
    await user.mutation(api.profiles.markTipSeen, { tip: 'tip-20' })
    expect((await user.query(api.profiles.getSeenTips, {})).length).toBe(20)
  })

  it('requires sign-in to mark a tip seen, but getSeenTips just returns empty', async () => {
    const t: T = createBackend()
    expect(await t.query(api.profiles.getSeenTips, {})).toEqual([])
    await expect(t.mutation(api.profiles.markTipSeen, { tip: 'workout' })).rejects.toThrow(
      /not signed in/i,
    )
  })
})

describe('setUnitPreference', () => {
  it('defaults to kg', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    expect((await user.query(api.profiles.getMine, {}))!.unitPreference).toBe('kg')
  })

  it('saves lb and back to kg', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.setUnitPreference, { unitPreference: 'lb' })
    expect((await user.query(api.profiles.getMine, {}))!.unitPreference).toBe('lb')

    await user.mutation(api.profiles.setUnitPreference, { unitPreference: 'kg' })
    expect((await user.query(api.profiles.getMine, {}))!.unitPreference).toBe('kg')
  })

  // Display preference only — the stored body stats must stay canonical.
  it('does not touch stored heightCm/weightKg', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await user.mutation(api.profiles.updateBodyStats, {
      heightCm: 180,
      weightKg: 80,
      age: 30,
      sex: 'male',
      activityLevel: 'moderate',
    })

    await user.mutation(api.profiles.setUnitPreference, { unitPreference: 'lb' })

    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({ heightCm: 180, weightKg: 80, unitPreference: 'lb' })
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.profiles.setUnitPreference, { unitPreference: 'lb' }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('setDailyVolumeGoal', () => {
  it('defaults to null and pointsBalance defaults to 0', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({ dailyVolumeGoalKg: null, pointsBalance: 0 })
  })

  it('saves and returns the goal', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.setDailyVolumeGoal, { dailyVolumeGoalKg: 2000 })
    expect((await user.query(api.profiles.getMine, {}))!.dailyVolumeGoalKg).toBe(2000)
  })

  it('rejects an out-of-range goal', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await expect(
      user.mutation(api.profiles.setDailyVolumeGoal, { dailyVolumeGoalKg: 0 }),
    ).rejects.toThrow(/between/i)
    await expect(
      user.mutation(api.profiles.setDailyVolumeGoal, { dailyVolumeGoalKg: 1_000_000 }),
    ).rejects.toThrow(/between/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.profiles.setDailyVolumeGoal, { dailyVolumeGoalKg: 2000 }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('markReleaseSeen', () => {
  it('defaults to null', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    expect((await user.query(api.profiles.getMine, {}))!.lastSeenRelease).toBeNull()
  })

  it('records the dismissed release and overwrites an older one', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.profiles.markReleaseSeen, { version: '1.0.0' })
    expect((await user.query(api.profiles.getMine, {}))!.lastSeenRelease).toBe('1.0.0')

    await user.mutation(api.profiles.markReleaseSeen, { version: '1.1.0' })
    expect((await user.query(api.profiles.getMine, {}))!.lastSeenRelease).toBe('1.1.0')
  })

  it('rejects an empty or oversized version', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await expect(
      user.mutation(api.profiles.markReleaseSeen, { version: '   ' }),
    ).rejects.toThrow(/required/i)
    await expect(
      user.mutation(api.profiles.markReleaseSeen, { version: 'v'.repeat(41) }),
    ).rejects.toThrow(/too long/i)
  })

  it('is scoped to the caller', async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))

    await alice.mutation(api.profiles.markReleaseSeen, { version: '1.1.0' })
    expect((await bob.query(api.profiles.getMine, {}))!.lastSeenRelease).toBeNull()
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.profiles.markReleaseSeen, { version: '1.1.0' }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('getMine points fields', () => {
  it('defaults week and month points to 0', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    const profile = await user.query(api.profiles.getMine, {})
    expect(profile).toMatchObject({ pointsBalance: 0, weekPoints: 0, monthPoints: 0 })
  })

  it('reports points earned this week alongside the balance', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    await logWorkoutOn(t, user, exerciseId, {
      startedAt: utcWeekStart(Date.now()) + 12 * 3600_000,
    })

    const profile = (await user.query(api.profiles.getMine, {}))!
    expect(profile.weekPoints).toBeGreaterThan(0)
    expect(profile.weekPoints).toBe(profile.pointsBalance)
  })

  it('keeps the balance when points are spent, but not the earned total', async () => {
    // Earned and balance diverge the moment a wager is escrowed; the
    // leaderboard follows the earned number.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    await logWorkoutOn(t, user, exerciseId, {
      startedAt: utcWeekStart(Date.now()) + 12 * 3600_000,
    })
    const earned = (await user.query(api.profiles.getMine, {}))!.weekPoints

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique()
      await ctx.db.patch(profile!._id, { pointsBalance: 0 })
    })

    const after = (await user.query(api.profiles.getMine, {}))!
    expect(after.pointsBalance).toBe(0)
    expect(after.weekPoints).toBe(earned)
  })
})

import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { asUser, createBackend, createUser, type T } from './test.helpers'

// The blanket per-user write budget (`userWrite` in convex/rateLimiter.ts).
//
// The named limits in that file guard *social* actions — spam another user
// receives. This one guards the app itself against an authenticated client
// hammering its own self-scoped writes, which costs function calls and storage
// even though nobody else ever sees it.
//
// `workouts.start` is the probe because it is idempotent: with a workout
// already active it returns the existing id without inserting anything, so
// these tests exercise the budget rather than the row-growth caps.
describe('per-user write budget', () => {
  async function signedIn(t: T, name: string) {
    return asUser(t, await createUser(t, name))
  }

  it('lets a realistic logging session through untouched', async () => {
    const t = createBackend()
    const alice = await signedIn(t, 'alice')

    // ~30 writes/minute is a brisk real session (updateSet fires on blur, not
    // per keystroke). The budget must be invisible at that rate.
    for (let i = 0; i < 30; i++) {
      await alice.mutation(api.workouts.start, {})
    }
  })

  it('refuses a scripted flood from one account', async () => {
    const t = createBackend()
    const alice = await signedIn(t, 'alice')

    // Capacity is 60. Drain it, then the next call must be refused rather
    // than quietly served.
    await expect(async () => {
      for (let i = 0; i < 200; i++) {
        await alice.mutation(api.workouts.start, {})
      }
    }).rejects.toThrow(/rate/i)
  })

  it('is per-user, so one abuser cannot lock everyone else out', async () => {
    const t = createBackend()
    const alice = await signedIn(t, 'alice')
    const bob = await signedIn(t, 'bob')

    await expect(async () => {
      for (let i = 0; i < 200; i++) {
        await alice.mutation(api.workouts.start, {})
      }
    }).rejects.toThrow(/rate/i)

    // Bob's bucket is untouched — this is the property that makes the limit
    // safe to apply app-wide.
    await expect(bob.mutation(api.workouts.start, {})).resolves.toBeTruthy()
  })
})

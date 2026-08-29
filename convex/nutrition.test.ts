import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { DAY_MS } from './fitness'
import { LIMITS } from './validation'
import { asUser, createBackend, createUser, deleteAccountAndPurge, type T } from './test.helpers'

// Puts a blob straight into file storage, standing in for the browser's POST
// to the generated upload URL — same helper shape as avatars.test.ts.
async function storeBlob(t: T, blob: Blob): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => await ctx.storage.store(blob))
}

function jpegBlob(sizeBytes = 64): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'image/jpeg' })
}

async function storedFileCount(t: T): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)
}

describe('logManualEntry', () => {
  it('logs an entry and it shows up in today totals', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.nutrition.logManualEntry, {
      calories: 500,
      proteinG: 40,
      carbsG: 50,
      fatG: 15,
    })

    const today = await user.query(api.nutrition.getToday, {})
    expect(today.totals).toMatchObject({ calories: 500, proteinG: 40, carbsG: 50, fatG: 15 })
    expect(today.entries).toHaveLength(1)
    expect(today.entries[0]).toMatchObject({ source: 'manual', status: 'complete' })
  })

  it('sums multiple entries', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.nutrition.logManualEntry, { calories: 300 })
    await user.mutation(api.nutrition.logManualEntry, { calories: 200 })

    expect((await user.query(api.nutrition.getToday, {})).totals.calories).toBe(500)
  })

  it('rejects an empty entry', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await expect(user.mutation(api.nutrition.logManualEntry, {})).rejects.toThrow(
      /at least one value/i,
    )
  })

  it('rejects an out-of-range value', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await expect(
      user.mutation(api.nutrition.logManualEntry, { calories: -1 }),
    ).rejects.toThrow(/between/i)
    await expect(
      user.mutation(api.nutrition.logManualEntry, { calories: LIMITS.calories + 1 }),
    ).rejects.toThrow(/between/i)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    await expect(
      t.mutation(api.nutrition.logManualEntry, { calories: 100 }),
    ).rejects.toThrow(/not signed in/i)
  })

  it('caps entries per day', async () => {
    const t = createBackend()
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    // Inserted directly rather than looping the real mutation: a loop that
    // long also trips the blanket per-user write budget (rateLimiter.ts
    // userWrite, capacity 60) before it ever reaches this cap, which would
    // test the wrong limit. This puts the account at the cap in one step so
    // only foodLogsPerDay is under test.
    await t.run(async (ctx) => {
      for (let i = 0; i < LIMITS.foodLogsPerDay; i++) {
        await ctx.db.insert('foodLogs', {
          ownerId: userId,
          loggedAt: Date.now(),
          source: 'manual',
          status: 'complete',
          calories: 1,
        })
      }
    })

    await expect(
      user.mutation(api.nutrition.logManualEntry, { calories: 1 }),
    ).rejects.toThrow(/max entries/i)
  })
})

describe('getToday — day bucketing', () => {
  it('excludes entries from other days', async () => {
    const t = createBackend()
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    await user.mutation(api.nutrition.logManualEntry, { calories: 100 })
    // Directly insert a row from yesterday — bypasses the mutation (which
    // always stamps `now`) so the query's own day-range filter is what's
    // actually under test, not the insert path.
    await t.run(async (ctx) => {
      await ctx.db.insert('foodLogs', {
        ownerId: userId,
        loggedAt: Date.now() - DAY_MS,
        source: 'manual',
        status: 'complete',
        calories: 9999,
      })
    })

    const today = await user.query(api.nutrition.getToday, {})
    expect(today.totals.calories).toBe(100)
    expect(today.entries).toHaveLength(1)
  })

  it('returns empty totals when signed out', async () => {
    const t: T = createBackend()
    const today = await t.query(api.nutrition.getToday, {})
    expect(today).toEqual({
      entries: [],
      totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    })
  })
})

describe('deleteEntry', () => {
  it('removes the row and frees its photo blob', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, jpegBlob())
    const logged = await user.mutation(api.nutrition.logPhotoEntry, { storageId })
    if (!logged.ok) throw new Error('expected ok')

    await user.mutation(api.nutrition.deleteEntry, { foodLogId: logged.foodLogId })

    expect((await user.query(api.nutrition.getToday, {})).entries).toHaveLength(0)
    expect(await storedFileCount(t)).toBe(0)
  })

  it("rejects deleting someone else's entry", async () => {
    const t = createBackend()
    const alice = asUser(t, await createUser(t, 'alice'))
    const bob = asUser(t, await createUser(t, 'bob'))

    await alice.mutation(api.nutrition.logManualEntry, { calories: 100 })
    const [entry] = (await alice.query(api.nutrition.getToday, {})).entries

    await expect(
      bob.mutation(api.nutrition.deleteEntry, { foodLogId: entry._id }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('logPhotoEntry', () => {
  it('creates a pending entry for a valid image', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, jpegBlob())
    const result = await user.mutation(api.nutrition.logPhotoEntry, { storageId })
    expect(result).toMatchObject({ ok: true })

    const today = await user.query(api.nutrition.getToday, {})
    expect(today.entries[0]).toMatchObject({ source: 'photo', status: 'pending' })
  })

  // Note: like profiles.ts:setAvatar, the sibling contentType rejection
  // can't be exercised here — convex-test's storage.store records only
  // sha256 and size, never a contentType — but it's the same branch as the
  // size check below, so the reject-and-clean-up behaviour is still covered.
  it('rejects an oversized photo and deletes the rejected upload', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, jpegBlob(8 * 1024 * 1024 + 1))
    const result = await user.mutation(api.nutrition.logPhotoEntry, { storageId })
    expect(result).toMatchObject({ ok: false })
    expect(await storedFileCount(t)).toBe(0)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const storageId = await storeBlob(t, jpegBlob())
    await expect(
      t.mutation(api.nutrition.logPhotoEntry, { storageId }),
    ).rejects.toThrow(/not signed in/i)
  })
})

// Enforcement is deliberately conditional on AI_GATEWAY_API_KEY being set —
// same "off when unconfigured, and that must fail closed with a clear
// message rather than hang" shape as convex/turnstile.test.ts.
describe('analyzeFoodPhoto — not configured', () => {
  const KEY = 'AI_GATEWAY_API_KEY'
  beforeEach(() => {
    delete process.env[KEY]
  })
  afterEach(() => {
    delete process.env[KEY]
  })

  it('fails closed and marks the entry failed', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, jpegBlob())
    const logged = await user.mutation(api.nutrition.logPhotoEntry, { storageId })
    if (!logged.ok) throw new Error('expected ok')

    await expect(
      user.action(api.nutrition.analyzeFoodPhoto, { foodLogId: logged.foodLogId, storageId }),
    ).rejects.toThrow(/not set up/i)

    const today = await user.query(api.nutrition.getToday, {})
    expect(today.entries[0]).toMatchObject({ status: 'failed' })
  })
})

describe('account deletion', () => {
  it('frees a food photo blob', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.nutrition.logManualEntry, { calories: 100 })
    const storageId = await storeBlob(t, jpegBlob())
    await user.mutation(api.nutrition.logPhotoEntry, { storageId })
    expect(await storedFileCount(t)).toBe(1)

    await deleteAccountAndPurge(t, user)

    expect(await storedFileCount(t)).toBe(0)
  })
})

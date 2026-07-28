import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { asUser, createBackend, createUser, type T } from './test.helpers'

// Puts a blob straight into file storage, standing in for the browser's
// POST to the generated upload URL.
async function storeBlob(t: T, blob: Blob): Promise<Id<'_storage'>> {
  return await t.run(async (ctx) => await ctx.storage.store(blob))
}

function pngBlob(sizeBytes = 64): Blob {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'image/png' })
}

async function storedFileCount(t: T): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)
}

describe('setAvatar', () => {
  it('attaches the image and exposes a URL on the profile', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, pngBlob())
    await user.mutation(api.profiles.setAvatar, { storageId })

    expect((await user.query(api.profiles.getMine, {}))!.avatarUrl).toBeTruthy()
  })

  it('deletes the previous image when a new one replaces it', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const first = await storeBlob(t, pngBlob())
    await user.mutation(api.profiles.setAvatar, { storageId: first })
    const second = await storeBlob(t, pngBlob())
    await user.mutation(api.profiles.setAvatar, { storageId: second })

    // The old blob must not linger — nothing would ever reference it again.
    expect(await storedFileCount(t)).toBe(1)
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(first))).toBeNull()
  })

  // Note: the sibling `contentType` rejection can't be exercised here —
  // convex-test's storage.store records only sha256 and size, never a
  // contentType — but it's the same branch as the size check below, so the
  // reject-and-clean-up behaviour is still covered.
  it('rejects an oversized image and deletes the rejected upload', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, pngBlob(5 * 1024 * 1024 + 1))
    const result = await user.mutation(api.profiles.setAvatar, { storageId })
    expect(result).toMatchObject({ ok: false })

    // Regression guard: this returns a result instead of throwing precisely
    // so the cleanup commits. Throwing would roll the delete back with the
    // rest of the mutation and orphan the blob in storage forever.
    expect(await storedFileCount(t)).toBe(0)
  })

  it('requires sign-in', async () => {
    const t: T = createBackend()
    const storageId = await storeBlob(t, pngBlob())
    await expect(t.mutation(api.profiles.setAvatar, { storageId })).rejects.toThrow(
      /not signed in/i,
    )
  })
})

describe('removeAvatar', () => {
  it('clears the profile field and frees the blob', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    const storageId = await storeBlob(t, pngBlob())
    await user.mutation(api.profiles.setAvatar, { storageId })
    await user.mutation(api.profiles.removeAvatar, {})

    expect((await user.query(api.profiles.getMine, {}))!.avatarUrl).toBeNull()
    expect(await storedFileCount(t)).toBe(0)
  })

  it('is a no-op when there is no avatar', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await expect(user.mutation(api.profiles.removeAvatar, {})).resolves.not.toThrow()
  })
})

describe('avatar visibility', () => {
  async function userWithUsername(t: T, name: string) {
    const userId = await createUser(t, name)
    const user = asUser(t, userId)
    await user.mutation(api.profiles.setUsername, { username: name })
    return { userId, user }
  }

  it('friends see each other avatars in the friends list', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    await t.run(async (ctx) => {
      await ctx.db.insert('friendships', { userId: alice.userId, friendId: bob.userId })
      await ctx.db.insert('friendships', { userId: bob.userId, friendId: alice.userId })
    })

    await bob.user.mutation(api.profiles.setAvatar, { storageId: await storeBlob(t, pngBlob()) })

    const [friend] = await alice.user.query(api.friends.myFriends, {})
    expect(friend.avatarUrl).toBeTruthy()
  })

  // The whole reason profileForWithAvatar exists as a separate helper: a
  // username lookup is reachable by any signed-in stranger, so it must not
  // hand out a photo of someone who hasn't accepted them.
  it('a username search does NOT expose a stranger avatar', async () => {
    const t = createBackend()
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')

    await bob.user.mutation(api.profiles.setAvatar, { storageId: await storeBlob(t, pngBlob()) })

    const found = await alice.user.query(api.friends.resolveUsername, { username: 'bob' })
    expect(found).not.toBeNull()
    expect(found).not.toHaveProperty('avatarUrl')
  })
})

describe('account deletion', () => {
  it('frees the avatar blob', async () => {
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))
    await user.mutation(api.profiles.setAvatar, { storageId: await storeBlob(t, pngBlob()) })
    expect(await storedFileCount(t)).toBe(1)

    await user.mutation(api.account.deleteAccount, {})

    // Otherwise the file would sit in storage forever with nothing pointing
    // at it and no way to find it again.
    expect(await storedFileCount(t)).toBe(0)
  })
})

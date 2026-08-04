import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { utcWeekStart } from './fitness'
import {
  asUser,
  createBackend,
  createBuiltInExercise,
  logWorkoutOn,
  makeFriends,
  twoFriends,
  userWithUsername,
  type T,
  deleteAccountAndPurge,
} from './test.helpers'

type Visibility = 'public' | 'friends'

async function post(
  t: T,
  who: { user: ReturnType<typeof asUser> },
  exerciseId: Awaited<ReturnType<typeof createBuiltInExercise>>,
  visibility: Visibility,
  caption?: string,
) {
  const workoutId = await logWorkoutOn(t, who.user, exerciseId, {
    startedAt: utcWeekStart(Date.now()) + 12 * 3600_000 + Math.floor(Math.random() * 1000),
  })
  const result = await who.user.mutation(api.feed.createPost, {
    workoutId,
    visibility,
    ...(caption !== undefined && { caption }),
  })
  if (!result.ok) throw new Error(result.error)
  return result.postId
}

describe('createPost', () => {
  it('snapshots the workout so the post stands on its own', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t, 'Bench Press')
    const alice = await userWithUsername(t, 'alice')

    await post(t, alice, exerciseId, 'friends', 'Felt strong')

    const { posts } = await alice.user.query(api.feed.friendsFeed, {})
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      caption: 'Felt strong',
      visibility: 'friends',
      exerciseNames: ['Bench Press'],
      likeCount: 0,
      commentCount: 0,
    })
    expect(posts[0].volumeKg).toBe(500)
    // workouts.start names by time of day, so pin the shape not the word.
    expect(posts[0].workoutName).toMatch(/Workout$/)
  })

  it('refuses to share the same workout twice', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const workoutId = await logWorkoutOn(t, alice.user, exerciseId, {})

    await alice.user.mutation(api.feed.createPost, { workoutId, visibility: 'friends' })
    await expect(
      alice.user.mutation(api.feed.createPost, { workoutId, visibility: 'friends' }),
    ).rejects.toThrow(/already shared/i)
  })

  it("refuses someone else's workout", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const workoutId = await logWorkoutOn(t, alice.user, exerciseId, {})

    await expect(
      bob.user.mutation(api.feed.createPost, { workoutId, visibility: 'public' }),
    ).rejects.toThrow(/not found/i)
  })
})

describe('visibility', () => {
  it('a stranger sees a public post but never a friends-only one', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const stranger = await userWithUsername(t, 'stranger')

    const publicId = await post(t, alice, exerciseId, 'public')
    const privateId = await post(t, alice, exerciseId, 'friends')

    const { posts } = await stranger.user.query(api.feed.discoverFeed, {})
    expect(posts.map((p) => p._id)).toEqual([publicId])

    // ...and not by direct URL either.
    expect(await stranger.user.query(api.feed.getPost, { postId: privateId })).toBeNull()
    expect(await stranger.user.query(api.feed.getPost, { postId: publicId })).not.toBeNull()
  })

  it('a friend sees both', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)

    await post(t, alice, exerciseId, 'public')
    await post(t, alice, exerciseId, 'friends')

    const { posts } = await bob.user.query(api.feed.friendsFeed, {})
    expect(posts).toHaveLength(2)
  })

  it('the friends feed never shows a stranger, even a public one', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const stranger = await userWithUsername(t, 'stranger')
    await post(t, stranger, exerciseId, 'public')

    const { posts } = await alice.user.query(api.feed.friendsFeed, {})
    expect(posts).toEqual([])
  })

  it('never leaks an email address as a display name', async () => {
    // friends.ts's profileFor falls back to the user's email. A public feed
    // must not use it — this is the highest-severity mistake available here
    // and it is one wrong import away.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const userId = await t.run(async (ctx) =>
      ctx.db.insert('users', { email: 'someone@private.example' }),
    )
    const noNameUser = { user: asUser(t, userId) }
    await post(t, noNameUser, exerciseId, 'public')

    const stranger = await userWithUsername(t, 'stranger')
    const { posts } = await stranger.user.query(api.feed.discoverFeed, {})
    expect(posts[0].author.displayName).not.toContain('@')
  })
})

describe('likes and comments', () => {
  it('toggles a like and keeps the counter in step', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'friends')

    expect(await bob.user.mutation(api.feed.toggleLike, { postId })).toEqual({ liked: true })
    let seen = (await bob.user.query(api.feed.friendsFeed, {})).posts[0]
    expect(seen.likeCount).toBe(1)
    expect(seen.likedByMe).toBe(true)

    expect(await bob.user.mutation(api.feed.toggleLike, { postId })).toEqual({ liked: false })
    seen = (await bob.user.query(api.feed.friendsFeed, {})).posts[0]
    expect(seen.likeCount).toBe(0)
    expect(seen.likedByMe).toBe(false)
  })

  it('notifies the author, but never for their own action', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'friends')

    await alice.user.mutation(api.feed.toggleLike, { postId })
    expect(await alice.user.query(api.notifications.listUnread, {})).toHaveLength(0)

    await bob.user.mutation(api.feed.toggleLike, { postId })
    const notices = await alice.user.query(api.notifications.listUnread, {})
    expect(notices.map((n) => n.kind)).toContain('post_liked')
  })

  it('coalesces repeat likes on one post into a single notice', async () => {
    // The banner shows three at a time and has no overflow, so without this
    // a popular post buries every friend request behind it.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const carol = await userWithUsername(t, 'carol')
    await makeFriends(t, alice.userId, bob.userId)
    await makeFriends(t, alice.userId, carol.userId)

    const postId = await post(t, alice, exerciseId, 'friends')
    await bob.user.mutation(api.feed.toggleLike, { postId })
    await carol.user.mutation(api.feed.toggleLike, { postId })

    const likes = (await alice.user.query(api.notifications.listUnread, {})).filter(
      (n) => n.kind === 'post_liked',
    )
    expect(likes).toHaveLength(1)
    expect(likes[0].othersCount).toBe(1) // "carol and 1 other"
  })

  it('adds and deletes comments, keeping the counter in step', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'friends')

    const commentId = await bob.user.mutation(api.feed.addComment, {
      postId,
      text: 'Big lift',
    })
    let detail = (await alice.user.query(api.feed.getPost, { postId }))!
    expect(detail.comments).toHaveLength(1)
    expect(detail.post.commentCount).toBe(1)

    // The post's owner may moderate their own thread.
    await alice.user.mutation(api.feed.deleteComment, { commentId })
    detail = (await alice.user.query(api.feed.getPost, { postId }))!
    expect(detail.comments).toHaveLength(0)
    expect(detail.post.commentCount).toBe(0)
  })

  it('refuses a like on a friends-only post from a stranger', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const stranger = await userWithUsername(t, 'stranger')
    const postId = await post(t, alice, exerciseId, 'friends')

    await expect(
      stranger.user.mutation(api.feed.toggleLike, { postId }),
    ).rejects.toThrow(/not available/i)
  })

  it('rejects an empty comment', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'friends')
    await expect(
      bob.user.mutation(api.feed.addComment, { postId, text: '   ' }),
    ).rejects.toThrow(/required/i)
  })
})

describe('repost', () => {
  it('cannot repost a friends-only post', async () => {
    // The sharpest edge in the feature: my friends are not the author's
    // friends, so no visibility setting on my repost could make this safe.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'friends')

    await expect(bob.user.mutation(api.feed.repost, { postId })).rejects.toThrow(
      /friends-only/i,
    )
  })

  it('reposts a public post and embeds the original', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const postId = await post(t, alice, exerciseId, 'public', 'PB day')

    await bob.user.mutation(api.feed.repost, { postId, caption: 'Get it' })

    const mine = (await bob.user.query(api.feed.friendsFeed, {})).posts
    expect(mine).toHaveLength(1)
    expect(mine[0].caption).toBe('Get it')
    expect(mine[0].repostOf).toMatchObject({ available: true, caption: 'PB day' })
    expect((mine[0].repostOf as { author: { username: string } }).author.username).toBe('alice')
  })

  it('collapses a repost of a repost to one level', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const carol = await userWithUsername(t, 'carol')

    const original = await post(t, alice, exerciseId, 'public')
    await bob.user.mutation(api.feed.repost, { postId: original })
    const bobsRepost = (await bob.user.query(api.feed.friendsFeed, {})).posts[0]._id
    await carol.user.mutation(api.feed.repost, { postId: bobsRepost })

    const carols = (await carol.user.query(api.feed.friendsFeed, {})).posts[0]
    // Points at Alice's original, not at Bob's repost.
    expect((carols.repostOf as { _id: string })._id).toBe(original)
  })

  it('shows "unavailable" once the original is deleted', async () => {
    // The read-time half of the rule. Without it, deleting an original would
    // leave its content alive inside every repost of it.
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const bob = await userWithUsername(t, 'bob')
    const original = await post(t, alice, exerciseId, 'public')
    await bob.user.mutation(api.feed.repost, { postId: original })

    // Sever the link the way a stale row would, then delete the original.
    await t.run(async (ctx) => {
      const repostRow = (await ctx.db.query('posts').collect()).find((p) => p.repostOfId)!
      await ctx.db.patch(repostRow._id, { repostOfId: original })
      await ctx.db.delete(original)
    })

    const carols = (await bob.user.query(api.feed.friendsFeed, {})).posts[0]
    expect(carols.repostOf).toEqual({ available: false })
  })
})

describe('blocking', () => {
  it('hides a blocked author from both feeds', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    await post(t, bob, exerciseId, 'public')

    expect((await alice.user.query(api.feed.friendsFeed, {})).posts).toHaveLength(1)
    await alice.user.mutation(api.feed.blockUser, { userId: bob.userId })
    expect((await alice.user.query(api.feed.friendsFeed, {})).posts).toEqual([])
    expect((await alice.user.query(api.feed.discoverFeed, {})).posts).toEqual([])

    await alice.user.mutation(api.feed.unblockUser, { userId: bob.userId })
    expect((await alice.user.query(api.feed.friendsFeed, {})).posts).toHaveLength(1)
  })

  it('stops a blocked user interacting with my posts', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'public')

    await alice.user.mutation(api.feed.blockUser, { userId: bob.userId })
    await expect(bob.user.mutation(api.feed.toggleLike, { postId })).rejects.toThrow(
      /not available/i,
    )
  })
})

describe('deletePost', () => {
  it('cascades likes, comments and reposts', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'public')

    await bob.user.mutation(api.feed.toggleLike, { postId })
    await bob.user.mutation(api.feed.addComment, { postId, text: 'nice' })
    await bob.user.mutation(api.feed.repost, { postId })

    await alice.user.mutation(api.feed.deletePost, { postId })

    await t.run(async (ctx) => {
      expect(await ctx.db.query('posts').collect()).toEqual([])
      expect(await ctx.db.query('postLikes').collect()).toEqual([])
      expect(await ctx.db.query('postComments').collect()).toEqual([])
    })
  })

  it("refuses someone else's post", async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const postId = await post(t, alice, exerciseId, 'public')
    await expect(bob.user.mutation(api.feed.deletePost, { postId })).rejects.toThrow(
      /not found/i,
    )
  })
})

describe('workout deletion', () => {
  it('unlinks the post rather than destroying it', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const alice = await userWithUsername(t, 'alice')
    const workoutId = await logWorkoutOn(t, alice.user, exerciseId, {})
    await alice.user.mutation(api.feed.createPost, { workoutId, visibility: 'friends' })

    await alice.user.mutation(api.history.deleteWorkout, { workoutId })

    const { posts } = await alice.user.query(api.feed.friendsFeed, {})
    expect(posts).toHaveLength(1)
    expect(posts[0].workoutId).toBeNull()
    // The snapshot still stands on its own.
    expect(posts[0].workoutName).toMatch(/Workout$/)
    expect(posts[0].volumeKg).toBe(500)
  })
})

describe('account deletion', () => {
  it('removes my posts and decrements counters on posts I touched', async () => {
    const t = createBackend()
    const exerciseId = await createBuiltInExercise(t)
    const { alice, bob } = await twoFriends(t)
    const alicePost = await post(t, alice, exerciseId, 'public')
    await post(t, bob, exerciseId, 'public')

    await bob.user.mutation(api.feed.toggleLike, { postId: alicePost })
    await bob.user.mutation(api.feed.addComment, { postId: alicePost, text: 'hi' })

    await deleteAccountAndPurge(t, bob.user)

    const detail = (await alice.user.query(api.feed.getPost, { postId: alicePost }))!
    expect(detail.post.likeCount).toBe(0)
    expect(detail.post.commentCount).toBe(0)
    expect(detail.comments).toEqual([])

    await t.run(async (ctx) => {
      const remaining = await ctx.db.query('posts').collect()
      expect(remaining.map((p) => p._id)).toEqual([alicePost])
    })
  })
})

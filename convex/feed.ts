import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { publicIdentityMap } from './identity'
import { areFriends } from './friendships'
import { notify } from './notifications'
import { rateLimiter, requireWriter } from './rateLimiter'
import { cleanText, LIMITS } from './validation'

// Bigger than an avatar: feed photos are 4:5 at up to 1440px.
const MAX_POST_PHOTO_BYTES = 8 * 1024 * 1024

// Mutation-only: every write in this module goes through here, so it is the
// single place to charge the per-user write budget. Queries in this file call
// `getAuthUserId` directly — the limiter writes, so a query cannot consume it.
async function requireUserId(ctx: MutationCtx) {
  return await requireWriter(ctx)
}

/** Everyone this user has blocked, for filtering both feed streams. */
async function blockedIds(ctx: QueryCtx, userId: Id<'users'>): Promise<Set<Id<'users'>>> {
  const rows = await ctx.db
    .query('blockedUsers')
    .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
    .collect()
  return new Set(rows.map((r) => r.blockedUserId))
}

// ---------- reading ----------

type Cursor = { createdAt: number; id: Id<'posts'> } | null

/**
 * Turns raw post rows into what the client renders.
 *
 * Everything expensive is already denormalized onto the row, so this costs
 * one identity read per DISTINCT author, one `get` per repost, one storage
 * URL per photo, and one point lookup per post for "did I like it". A
 * 12-post page lands around 60 reads; deriving the workout summary per post
 * instead would be 250+.
 */
async function hydrate(ctx: QueryCtx, viewerId: Id<'users'>, posts: Doc<'posts'>[]) {
  const originals = new Map<Id<'posts'>, Doc<'posts'> | null>()
  for (const p of posts) {
    if (p.repostOfId && !originals.has(p.repostOfId)) {
      originals.set(p.repostOfId, await ctx.db.get(p.repostOfId))
    }
  }

  const identities = await publicIdentityMap(ctx, [
    ...posts.map((p) => p.authorId),
    ...[...originals.values()].flatMap((o) => (o ? [o.authorId] : [])),
  ])

  const liked = new Set<Id<'posts'>>(
    (
      await Promise.all(
        posts.map(async (p) => {
          const row = await ctx.db
            .query('postLikes')
            .withIndex('by_user_post', (q) => q.eq('userId', viewerId).eq('postId', p._id))
            .unique()
          return row ? p._id : null
        }),
      )
    ).filter((id): id is Id<'posts'> => id !== null),
  )

  const snapshotOf = async (p: Doc<'posts'>) => ({
    workoutId: p.workoutId ?? null,
    workoutName: p.workoutName ?? null,
    workoutStartedAt: p.workoutStartedAt ?? null,
    durationMs: p.durationMs ?? null,
    volumeKg: p.volumeKg ?? null,
    setCount: p.setCount ?? null,
    prCount: p.prCount ?? null,
    exerciseNames: p.exerciseNames ?? [],
    photoUrl: p.photoStorageId ? await ctx.storage.getUrl(p.photoStorageId) : null,
  })

  return Promise.all(
    posts.map(async (p) => {
      const original = p.repostOfId ? (originals.get(p.repostOfId) ?? null) : null

      // Re-checked at READ time, not just at write time. Without this,
      // deleting an original — or it somehow ceasing to be public — would
      // leave its content living on inside every repost of it.
      const originalVisible = original !== null && original.visibility === 'public'

      return {
        _id: p._id,
        createdAt: p.createdAt,
        visibility: p.visibility,
        caption: p.caption ?? null,
        author: identities.get(p.authorId)!,
        isMine: p.authorId === viewerId,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        repostCount: p.repostCount,
        likedByMe: liked.has(p._id),
        ...(await snapshotOf(p)),
        // Discriminated on `available` rather than using a bare sentinel
        // string, so the client can narrow it — a string literal in a Convex
        // return type widens to `string` and TypeScript loses the branch.
        repostOf: p.repostOfId
          ? originalVisible
            ? {
                available: true as const,
                _id: original!._id,
                author: identities.get(original!.authorId)!,
                caption: original!.caption ?? null,
                createdAt: original!.createdAt,
                ...(await snapshotOf(original!)),
              }
            : { available: false as const }
          : null,
      }
    }),
  )
}

function afterCursor(post: Doc<'posts'>, cursor: Cursor): boolean {
  if (!cursor) return true
  return (
    post.createdAt < cursor.createdAt ||
    (post.createdAt === cursor.createdAt && post._id < cursor.id)
  )
}

/**
 * A page of the Friends feed: everything posted by you or an accepted
 * friend, newest first, regardless of each post's visibility.
 *
 * This is NOT a Convex `.paginate()` result. The page is a merge of up to
 * `feedMaxAuthors` separate index streams, and no single index has a cursor
 * that could describe it — so the cursor is the (createdAt, _id) of the last
 * item returned, which is sufficient because every stream is ordered by
 * createdAt and we only ever walk backwards.
 *
 * Why merge at read time rather than fan out to an inbox table on write:
 * visibility is then evaluated against live `friendships` rows, so there is
 * nothing to keep in sync and — crucially — unfriending someone cannot leave
 * their old friends-only posts sitting in your inbox. The fan-out design has
 * to remember to sweep those, and forgetting is a silent privacy bug.
 *
 * Splitting Friends and Discover into separate streams is what makes this
 * cheap at all: this one filters by AUTHORSHIP and needs no visibility
 * predicate, Discover filters by VISIBILITY and is a plain paginated query.
 * Neither needs an OR across indexes, which Convex cannot express.
 */
export const friendsFeed = query({
  args: {
    beforeCreatedAt: v.optional(v.number()),
    beforeId: v.optional(v.id('posts')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return { posts: [], nextCursor: null, isDone: true, truncated: false }

    const friendships = await ctx.db
      .query('friendships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    const allAuthors = [userId, ...friendships.map((f) => f.friendId)]
    const authorIds = allAuthors.slice(0, LIMITS.feedMaxAuthors)
    // Surfaced rather than silently swallowed: past the cap a heavy user's
    // feed omits authors, and the failure is otherwise invisible — posts
    // simply never appear. If this starts firing for real users, the fix is
    // to move this stream to a fan-out inbox table.
    const truncated = allAuthors.length > authorIds.length

    const cursor: Cursor =
      args.beforeCreatedAt !== undefined && args.beforeId !== undefined
        ? { createdAt: args.beforeCreatedAt, id: args.beforeId }
        : null

    const perAuthor = await Promise.all(
      authorIds.map((authorId) =>
        ctx.db
          .query('posts')
          .withIndex('by_author_createdAt', (q) =>
            cursor
              ? q.eq('authorId', authorId).lte('createdAt', cursor.createdAt)
              : q.eq('authorId', authorId),
          )
          .order('desc')
          .take(LIMITS.feedPageSize),
      ),
    )

    const blocked = await blockedIds(ctx, userId)
    // `lte` plus a JS tiebreak rather than `lt`, so two friends posting in
    // the same millisecond can't silently drop one of them.
    const merged = perAuthor
      .flat()
      .filter((p) => afterCursor(p, cursor) && !blocked.has(p.authorId))
      .sort((a, b) => b.createdAt - a.createdAt || (a._id < b._id ? 1 : -1))

    const page = merged.slice(0, LIMITS.feedPageSize)
    const last = page[page.length - 1]

    return {
      posts: await hydrate(ctx, userId, page),
      nextCursor: last ? { createdAt: last.createdAt, id: last._id } : null,
      isDone: merged.length <= LIMITS.feedPageSize,
      truncated,
    }
  },
})

/**
 * Public posts from everyone. A plain index scan on visibility — no merge,
 * no friendship lookup, and it can use Convex's own pagination.
 */
export const discoverFeed = query({
  args: {
    beforeCreatedAt: v.optional(v.number()),
    beforeId: v.optional(v.id('posts')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return { posts: [], nextCursor: null, isDone: true, truncated: false }

    const cursor: Cursor =
      args.beforeCreatedAt !== undefined && args.beforeId !== undefined
        ? { createdAt: args.beforeCreatedAt, id: args.beforeId }
        : null

    const blocked = await blockedIds(ctx, userId)
    const rows = await ctx.db
      .query('posts')
      .withIndex('by_visibility_createdAt', (q) =>
        cursor
          ? q.eq('visibility', 'public').lte('createdAt', cursor.createdAt)
          : q.eq('visibility', 'public'),
      )
      .order('desc')
      // Over-fetch so blocked authors being filtered out in JS doesn't leave
      // a short page and stall the infinite scroll.
      .take(LIMITS.feedPageSize * 3)

    const filtered = rows.filter((p) => afterCursor(p, cursor) && !blocked.has(p.authorId))
    const page = filtered.slice(0, LIMITS.feedPageSize)
    const last = page[page.length - 1]

    return {
      posts: await hydrate(ctx, userId, page),
      nextCursor: last ? { createdAt: last.createdAt, id: last._id } : null,
      isDone: rows.length < LIMITS.feedPageSize * 3,
      truncated: false,
    }
  },
})

/** One post plus its comment thread. */
export const getPost = query({
  args: { postId: v.id('posts') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    const post = await ctx.db.get(args.postId)
    if (!post) return null

    const blocked = await blockedIds(ctx, userId)
    if (blocked.has(post.authorId)) return null

    // Same rule as the feed streams, enforced again here because a post
    // detail page is reachable by direct URL.
    if (post.authorId !== userId && post.visibility === 'friends') {
      if (!(await areFriends(ctx, userId, post.authorId))) return null
    }

    const comments = await ctx.db
      .query('postComments')
      .withIndex('by_post_createdAt', (q) => q.eq('postId', args.postId))
      .order('asc')
      .take(LIMITS.commentsPerPost)

    const visibleComments = comments.filter((c) => !blocked.has(c.authorId))
    const identities = await publicIdentityMap(ctx, visibleComments.map((c) => c.authorId))

    // hydrate maps over its input, so one post in means one post out. Treated
    // as "not available" rather than asserted, since every other way this
    // query can fail already returns null and the page handles it.
    const [hydrated] = await hydrate(ctx, userId, [post])
    if (!hydrated) return null

    return {
      post: hydrated,
      comments: visibleComments.map((c) => ({
        _id: c._id,
        text: c.text,
        createdAt: c.createdAt,
        author: identities.get(c.authorId)!,
        isMine: c.authorId === userId,
      })),
    }
  },
})

// ---------- writing ----------

// Step 1 of the photo flow, mirroring profiles.generateAvatarUploadUrl.
export const generatePostPhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postPhotoUploadUrl', { key: userId, throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Publishes a workout to the feed.
 *
 * Returns `{ ok: false }` instead of throwing for blob problems, and the
 * ORDER of the checks below is load-bearing. A Convex mutation is
 * all-or-nothing, so throwing after `ctx.storage.delete(...)` rolls the
 * delete back and orphans the rejected blob forever — the same trap
 * documented on profiles.ts:setAvatar. Every cheap validation therefore runs
 * BEFORE the blob is inspected, and only the blob check returns rather than
 * throws. Do not reorder these while "tidying up the validation".
 */
export const createPost = mutation({
  args: {
    workoutId: v.id('workouts'),
    visibility: v.union(v.literal('public'), v.literal('friends')),
    caption: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; postId: Id<'posts'> } | { ok: false; error: string }> => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postCreate', { key: userId, throws: true })

    const workout = await ctx.db.get(args.workoutId)
    if (!workout || workout.ownerId !== userId) throw new ConvexError('Workout not found')
    if (workout.endedAt === undefined) throw new ConvexError('Finish the workout first')

    const existing = await ctx.db
      .query('posts')
      .withIndex('by_workout', (q) => q.eq('workoutId', args.workoutId))
      .first()
    if (existing) throw new ConvexError("You've already shared this workout")

    const caption =
      args.caption && args.caption.trim()
        ? cleanText(args.caption, LIMITS.postCaptionMaxLength, 'Caption')
        : undefined

    // --- everything below this line may touch storage ---
    if (args.storageId) {
      const metadata = await ctx.db.system.get('_storage', args.storageId)
      if (!metadata) return { ok: false, error: 'Upload not found — try again' }
      const wrongType =
        metadata.contentType !== undefined && !metadata.contentType.startsWith('image/')
      if (wrongType || metadata.size > MAX_POST_PHOTO_BYTES) {
        await ctx.storage.delete(args.storageId)
        return { ok: false, error: 'That file needs to be an image under 8MB' }
      }
    }

    const workoutExercises = await ctx.db
      .query('workoutExercises')
      .withIndex('by_workout', (q) => q.eq('workoutId', args.workoutId))
      .collect()
    const exerciseNames = (
      await Promise.all(workoutExercises.map((we) => ctx.db.get(we.exerciseId)))
    ).flatMap((e) => (e ? [e.name] : []))

    const postId = await ctx.db.insert('posts', {
      authorId: userId,
      createdAt: Date.now(),
      visibility: args.visibility,
      ...(caption !== undefined && { caption }),
      ...(args.storageId !== undefined && { photoStorageId: args.storageId }),
      workoutId: args.workoutId,
      workoutName: workout.name,
      workoutStartedAt: workout.startedAt,
      durationMs: (workout.endedAt ?? workout.startedAt) - workout.startedAt,
      volumeKg: workout.volumeKg ?? 0,
      setCount: workout.setCount ?? 0,
      prCount: workout.prCount ?? 0,
      exerciseNames,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
    })

    return { ok: true, postId }
  },
})

export const toggleLike = mutation({
  args: { postId: v.id('posts') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postLike', { key: userId, throws: true })

    const post = await ctx.db.get(args.postId)
    if (!post) throw new ConvexError('Post not found')
    await assertCanInteract(ctx, userId, post)

    const existing = await ctx.db
      .query('postLikes')
      .withIndex('by_user_post', (q) => q.eq('userId', userId).eq('postId', args.postId))
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
      await ctx.db.patch(args.postId, { likeCount: Math.max(0, post.likeCount - 1) })
      return { liked: false }
    }

    await ctx.db.insert('postLikes', { postId: args.postId, userId, createdAt: Date.now() })
    await ctx.db.patch(args.postId, { likeCount: post.likeCount + 1 })

    if (post.authorId !== userId) {
      await notify(ctx, {
        userId: post.authorId,
        kind: 'post_liked',
        fromUserId: userId,
        postId: args.postId,
        coalesceOnPost: true,
      })
    }
    return { liked: true }
  },
})

export const addComment = mutation({
  args: { postId: v.id('posts'), text: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postComment', { key: userId, throws: true })

    const post = await ctx.db.get(args.postId)
    if (!post) throw new ConvexError('Post not found')
    await assertCanInteract(ctx, userId, post)

    const text = cleanText(args.text, LIMITS.postCommentMaxLength, 'Comment')
    if (post.commentCount >= LIMITS.commentsPerPost) {
      throw new ConvexError('This post has too many comments')
    }

    const commentId = await ctx.db.insert('postComments', {
      postId: args.postId,
      authorId: userId,
      text,
      createdAt: Date.now(),
    })
    await ctx.db.patch(args.postId, { commentCount: post.commentCount + 1 })

    if (post.authorId !== userId) {
      await notify(ctx, {
        userId: post.authorId,
        kind: 'post_commented',
        fromUserId: userId,
        postId: args.postId,
        coalesceOnPost: true,
      })
    }
    return commentId
  },
})

export const deleteComment = mutation({
  args: { commentId: v.id('postComments') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const comment = await ctx.db.get(args.commentId)
    if (!comment) throw new ConvexError('Comment not found')

    const post = await ctx.db.get(comment.postId)
    // The comment's author may delete it, and so may the post's owner —
    // moderating your own post's thread is the minimum a UGC surface needs.
    const allowed = comment.authorId === userId || post?.authorId === userId
    if (!allowed) throw new ConvexError('Not yours to delete')

    await ctx.db.delete(args.commentId)
    if (post) await ctx.db.patch(post._id, { commentCount: Math.max(0, post.commentCount - 1) })
  },
})

/**
 * Reposts someone else's post.
 *
 * Friends-only posts cannot be reposted at all, and this is the sharpest
 * edge in the feature. The tempting middle ground — allow it but force the
 * repost to friends-only — STILL leaks, because my friends are not the
 * author's friends: my friends-only audience contains people the author
 * never granted access to. No visibility setting on my repost fixes that, so
 * public-only is the only sound rule.
 *
 * Enforced here at write time AND again at read time in `hydrate`, because
 * an original can be deleted after the fact.
 */
export const repost = mutation({
  args: { postId: v.id('posts'), caption: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postRepost', { key: userId, throws: true })

    const target = await ctx.db.get(args.postId)
    if (!target) throw new ConvexError('Post not found')

    // Collapse the chain: a repost of a repost points at the original, so
    // the embed is never more than one level deep.
    const originalId = target.repostOfId ?? target._id
    const original = await ctx.db.get(originalId)
    if (!original) throw new ConvexError('Post not found')

    if (original.visibility !== 'public') {
      throw new ConvexError("That post is friends-only — it can't be reposted")
    }
    if (original.authorId === userId) throw new ConvexError("That's your own post")

    const blocked = await blockedIds(ctx, userId)
    if (blocked.has(original.authorId)) throw new ConvexError('You have blocked this user')

    const caption =
      args.caption && args.caption.trim()
        ? cleanText(args.caption, LIMITS.postCaptionMaxLength, 'Caption')
        : undefined

    const postId = await ctx.db.insert('posts', {
      authorId: userId,
      createdAt: Date.now(),
      // A repost of a public post is itself public — anything narrower would
      // be a lie, since the content is public either way.
      visibility: 'public',
      ...(caption !== undefined && { caption }),
      repostOfId: originalId,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
    })
    await ctx.db.patch(originalId, { repostCount: original.repostCount + 1 })

    await notify(ctx, {
      userId: original.authorId,
      kind: 'post_reposted',
      fromUserId: userId,
      postId,
      coalesceOnPost: true,
    })
    return postId
  },
})

export const deletePost = mutation({
  args: { postId: v.id('posts') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const post = await ctx.db.get(args.postId)
    if (!post || post.authorId !== userId) throw new ConvexError('Post not found')

    await cascadeDeletePost(ctx, post)
  },
})

export const reportPost = mutation({
  args: { postId: v.id('posts'), reason: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    await rateLimiter.limit(ctx, 'postReport', { key: userId, throws: true })

    const post = await ctx.db.get(args.postId)
    if (!post) throw new ConvexError('Post not found')

    await ctx.db.insert('postReports', {
      postId: args.postId,
      reporterId: userId,
      reason: cleanText(args.reason, LIMITS.reportReasonMaxLength, 'Reason'),
      createdAt: Date.now(),
    })
  },
})

export const blockUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    if (args.userId === userId) throw new ConvexError("You can't block yourself")

    const existing = await ctx.db
      .query('blockedUsers')
      .withIndex('by_user_blocked', (q) =>
        q.eq('userId', userId).eq('blockedUserId', args.userId),
      )
      .unique()
    if (existing) return

    const mine = await ctx.db
      .query('blockedUsers')
      .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
      .collect()
    if (mine.length >= LIMITS.blockedUsersPerUser) {
      throw new ConvexError('Block list is full')
    }

    await ctx.db.insert('blockedUsers', {
      userId,
      blockedUserId: args.userId,
      createdAt: Date.now(),
    })
  },
})

export const unblockUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const existing = await ctx.db
      .query('blockedUsers')
      .withIndex('by_user_blocked', (q) =>
        q.eq('userId', userId).eq('blockedUserId', args.userId),
      )
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

export const myBlockedUsers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const rows = await ctx.db
      .query('blockedUsers')
      .withIndex('by_user_blocked', (q) => q.eq('userId', userId))
      .collect()
    const identities = await publicIdentityMap(ctx, rows.map((r) => r.blockedUserId))
    return rows.map((r) => identities.get(r.blockedUserId)!)
  },
})

// ---------- shared helpers ----------

// Whether this user may like or comment on a post: same visibility rule the
// feed uses, plus the block check in both directions.
async function assertCanInteract(ctx: MutationCtx, userId: Id<'users'>, post: Doc<'posts'>) {
  if (post.authorId === userId) return

  const blockedByMe = await ctx.db
    .query('blockedUsers')
    .withIndex('by_user_blocked', (q) =>
      q.eq('userId', userId).eq('blockedUserId', post.authorId),
    )
    .unique()
  const blockedMe = await ctx.db
    .query('blockedUsers')
    .withIndex('by_user_blocked', (q) =>
      q.eq('userId', post.authorId).eq('blockedUserId', userId),
    )
    .unique()
  if (blockedByMe || blockedMe) throw new ConvexError('Not available')

  if (post.visibility === 'friends' && !(await areFriends(ctx, userId, post.authorId))) {
    throw new ConvexError('Not available')
  }
}

/**
 * Deletes a post and everything hanging off it.
 *
 * The storage delete goes LAST, after every read and validation that could
 * throw — a throw after it would roll the delete back and orphan the blob.
 * Exported so account deletion reuses exactly this cascade.
 */
export async function cascadeDeletePost(ctx: MutationCtx, post: Doc<'posts'>) {
  const likes = await ctx.db
    .query('postLikes')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .collect()
  for (const like of likes) await ctx.db.delete(like._id)

  const comments = await ctx.db
    .query('postComments')
    .withIndex('by_post_createdAt', (q) => q.eq('postId', post._id))
    .collect()
  for (const comment of comments) await ctx.db.delete(comment._id)

  const reports = await ctx.db
    .query('postReports')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .collect()
  for (const report of reports) await ctx.db.delete(report._id)

  // Reposts of this post. They'd otherwise render "no longer available"
  // forever thanks to hydrate's read-time check — correct, but there's no
  // reason to keep the husks around.
  const reposts = await ctx.db
    .query('posts')
    .withIndex('by_repostOf', (q) => q.eq('repostOfId', post._id))
    .collect()
  for (const r of reposts) {
    const rLikes = await ctx.db
      .query('postLikes')
      .withIndex('by_post', (q) => q.eq('postId', r._id))
      .collect()
    for (const like of rLikes) await ctx.db.delete(like._id)
    const rComments = await ctx.db
      .query('postComments')
      .withIndex('by_post_createdAt', (q) => q.eq('postId', r._id))
      .collect()
    for (const comment of rComments) await ctx.db.delete(comment._id)
    await ctx.db.delete(r._id)
  }

  // If this post was itself a repost, decrement the original's counter.
  if (post.repostOfId) {
    const original = await ctx.db.get(post.repostOfId)
    if (original) {
      await ctx.db.patch(original._id, { repostCount: Math.max(0, original.repostCount - 1) })
    }
  }

  await ctx.db.delete(post._id)
  if (post.photoStorageId) await ctx.storage.delete(post.photoStorageId)
}

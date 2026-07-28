import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/**
 * Identity that is safe to show to a STRANGER.
 *
 * Deliberately never falls back to the user's email address the way
 * friends.ts's `profileFor` does. That fallback is fine where it lives — every
 * caller there has already established friendship or a public opt-in — but a
 * social feed puts these names in front of people who are neither, so one
 * wrong import would publish email addresses.
 *
 * notifications.ts already had a private copy of exactly this rule (its
 * `senderName`, added after a failing test caught the leak). This is that
 * rule promoted to a module now that the feed needs it in several more
 * places; `senderName` delegates here.
 *
 * The final 'Someone' fallback is close to unreachable — onboarding requires
 * both a username and a display name before any of these screens exist.
 */
export type PublicIdentity = {
  userId: Id<'users'>
  username: string | null
  displayName: string
}

export async function publicIdentity(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<PublicIdentity> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  return {
    userId,
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? profile?.username ?? 'Someone',
  }
}

/**
 * The same, plus the avatar URL.
 *
 * Separate from `publicIdentity` for the same reason friends.ts splits
 * `profileFor` from `profileForWithAvatar`: a photo is more personal than a
 * name, so it is only attached where the subject has actually opted in —
 * which for the feed means they chose to post publicly, and for everything
 * else means friendship is established.
 */
export async function publicIdentityWithAvatar(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<PublicIdentity & { avatarUrl: string | null }> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  return {
    userId,
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? profile?.username ?? 'Someone',
    avatarUrl: profile?.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null,
  }
}

/**
 * Resolves many users at once without re-reading a profile per row.
 *
 * A feed page of 20 posts is typically written by a handful of people, and
 * each post also carries a liker/commenter. Batching turns "one read per row"
 * into "one read per distinct person".
 */
export async function publicIdentityMap(
  ctx: QueryCtx,
  userIds: Id<'users'>[],
): Promise<Map<Id<'users'>, PublicIdentity & { avatarUrl: string | null }>> {
  const distinct = [...new Set(userIds)]
  const entries = await Promise.all(
    distinct.map(async (id) => [id, await publicIdentityWithAvatar(ctx, id)] as const),
  )
  return new Map(entries)
}

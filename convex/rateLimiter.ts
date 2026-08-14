import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter'
import { getAuthUserId } from '@convex-dev/auth/server'
import { components } from './_generated/api'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

// Central place for every app-level rate limit — see individual call sites
// for why each one exists. Token buckets allow a small burst then settle to
// the steady rate; fixed windows are used where a hard global ceiling (not
// a per-key one) is the point.
//
// A Convex mutation is all-or-nothing: if a `rateLimiter.limit()` call
// succeeds but the *same* mutation throws afterwards for some other reason
// (bad input, a business-rule rejection, ...), the whole transaction rolls
// back, including the token it just consumed. So these limits only throttle
// the rate of *successful* operations, not retries of a rejected one —
// which is what actually matters here: the thing being guarded against is
// spam that lands (an extra friend request, ping, or challenge another user
// sees), not a client that keeps resubmitting bad input.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Blanket per-user write budget, keyed by caller userId — defence in depth
  // behind the specific limits below.
  //
  // The named limits guard *social* actions: spam another user receives. They
  // do nothing about an authenticated client hammering its own self-scoped
  // writes (logging sets, starting workouts, toggling favourites), which costs
  // function calls and storage even though nobody else sees it. With the app
  // going public that's the cheapest way for one account to degrade it.
  //
  // Sized off real use, not guesswork: the busiest screen is an active
  // workout, and `updateSet` fires on blur rather than per keystroke, so a
  // brisk logging session is ~20-30 writes/minute. 120/min sustained with a
  // 60 burst is 4-6x headroom for a human and still refuses a script.
  userWrite: { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 60 },

  // Account deletion, keyed by caller userId. It was never actually limited
  // before — the file *mentioned* `rateLimiter` (for the otpSend reset), which
  // is enough to fool a grep but not an attacker. Each call now tears down
  // auth and schedules a batched purge, so a repeat caller could otherwise
  // queue purge work faster than it drains. A human deletes their account
  // once, so this is deliberately tight.
  deleteAccount: { kind: 'token bucket', rate: 3, period: 60 * MINUTE, capacity: 2 },

  // New account creation, app-wide (not per-key: there's no per-signup
  // identifier to key on yet, and an IP isn't available to a Convex action).
  // Deters a scripted flood of throwaway accounts without touching normal
  // sign-up traffic. See convex/auth.ts.
  signUp: { kind: 'fixed window', rate: 20, period: 10 * MINUTE },

  // Verification/reset code sends, keyed by `${kind}:${email}`. Replaces the
  // old hand-rolled emailSendAttempts counter (see convex/emailAuth.ts) —
  // same 3-per-15-minutes behavior, but without the read-then-write race a
  // manual window counter has under concurrent requests.
  otpSend: { kind: 'token bucket', rate: 3, period: 15 * MINUTE, capacity: 3 },

  // Outgoing friend requests, keyed by caller userId. friendRequestsPerUser
  // (convex/validation.ts) caps how many can be pending at once, but doesn't
  // stop a script from firing requests as fast as the network allows.
  sendFriendRequest: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },

  // Gym pings, keyed by caller userId. The "one pending ping per friend"
  // rule (convex/pings.ts) limits standing spam, not send rate.
  pingSend: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },

  // Challenge proposals, keyed by caller userId.
  challengePropose: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },

  // Feature request submissions, keyed by caller userId. featureRequestsPerUser
  // caps lifetime total; this caps how fast they can arrive.
  featureRequestSubmit: { kind: 'token bucket', rate: 5, period: MINUTE, capacity: 3 },

  // Post-workout feedback submissions, keyed by caller userId. The "one row
  // per workout" uniqueness check already caps this at one per finish; this
  // just stops a script from hammering the mutation.
  workoutFeedbackSubmit: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },

  // Chat messages, keyed by sender. Deliberately looser than pings and
  // challenges: those are one-off events, whereas a real back-and-forth
  // conversation fires several messages a minute and shouldn't feel throttled.
  messageSend: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 15 },

  // Username lookups, keyed by caller userId. This one guards *reading*, not
  // spam: `resolveUsername` answers "does this username exist", so an
  // unthrottled caller can enumerate the whole user base as fast as the
  // network allows. It is also what makes the outgoing-request avatar
  // withholding necessary (see friends.ts:myOutgoingRequests), so the two
  // defences are related.
  //
  // Sized for the real flow: you type one username into the search box and
  // press Search. Ten in a burst covers someone working through a list of
  // gym friends; 20/minute sustained is far past human patience, while
  // turning an unbounded enumeration into a crawl.
  usernameLookup: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 10 },

  // Avatar upload URLs, keyed by caller userId. Each generated URL is a
  // licence to write a blob into file storage, and a client that requests one
  // but never calls setAvatar leaves an orphan behind — so the mint rate is
  // capped well below what any human re-cropping their photo would need.
  avatarUploadUrl: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 5 },

  // --- social feed ---
  // Posting is deliberate and infrequent; the burst allowance covers someone
  // sharing a backlog of a few workouts in one sitting.
  postCreate: { kind: 'token bucket', rate: 10, period: 60 * MINUTE, capacity: 3 },
  // Each call is permission to write a blob, same reasoning as avatarUploadUrl.
  postPhotoUploadUrl: { kind: 'token bucket', rate: 20, period: 60 * MINUTE, capacity: 5 },
  // Likes are a tap, so the ceiling is high — this only stops scripted floods.
  postLike: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
  postComment: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 10 },
  postRepost: { kind: 'token bucket', rate: 10, period: 60 * MINUTE, capacity: 5 },
  postReport: { kind: 'token bucket', rate: 10, period: 60 * MINUTE, capacity: 3 },
})

/**
 * Auth + the blanket per-user write budget, for the top of a public mutation.
 *
 * Deliberately a helper called from each file's existing mutation-side auth
 * path rather than a wrapper around `mutation`: the ownership helpers
 * (`getOwnedWorkout` and friends) are already the single funnel every write in
 * their module passes through, so putting it there covers a whole file without
 * touching each handler — and without a sweep across dozens of call sites.
 *
 * Only valid in a mutation. The limiter writes, so a query cannot consume it —
 * which is why `resolveUsername` is a mutation rather than the query it looks
 * like it should be (see `consumeUsernameLookup` below).
 */
export async function requireWriter(ctx: MutationCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx)
  if (userId === null) throw new Error('Not signed in')
  await consumeWriteBudget(ctx, userId)
  return userId
}

/** The budget half of `requireWriter`, for call sites that already have a userId. */
export async function consumeWriteBudget(ctx: MutationCtx, userId: Id<'users'>) {
  await rateLimiter.limit(ctx, 'userWrite', { key: userId, throws: true })
}

/**
 * Charges one username lookup against the caller.
 *
 * Separate from the blanket write budget on purpose: 120 writes/minute is
 * sized for logging an active workout, which would still let someone walk
 * through thousands of usernames an hour. Enumeration needs its own, much
 * tighter ceiling.
 */
export async function consumeUsernameLookup(ctx: MutationCtx, userId: Id<'users'>) {
  await rateLimiter.limit(ctx, 'usernameLookup', { key: userId, throws: true })
}

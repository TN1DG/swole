import { RateLimiter, MINUTE } from '@convex-dev/rate-limiter'
import { components } from './_generated/api'

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

  // Chat messages, keyed by sender. Deliberately looser than pings and
  // challenges: those are one-off events, whereas a real back-and-forth
  // conversation fires several messages a minute and shouldn't feel throttled.
  messageSend: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 15 },

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

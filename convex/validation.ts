// Server-side input validation shared by all mutations.
// Convex's v.number()/v.string() validate the TYPE but not the CONTENT:
// NaN, Infinity, 1e308, or megabyte strings all pass the wire validators,
// so every mutation must sanitize what it stores.
//
// Every rejection here is an expected, user-caused condition (a name too
// long, a weight out of range) — the kind of thing a form should show back
// to the user as-is. That's exactly what ConvexError is for: a plain
// `throw new Error(...)` reaches the client wrapped in a
// "[CONVEX ...] Server Error" / stack-trace envelope meant for debugging
// unexpected failures, not a message meant to be read by an end user.
// ConvexError's `.message` (and `.data`) arrive at the client exactly as
// thrown, so the existing `err.message` catch-blocks across the app show
// the real requirement instead of that envelope.
import { ConvexError } from 'convex/values'

// Trimmed, non-empty, length-capped user-facing name. `label` is what shows
// up in the error ("Display name", "Routine name", ...) — defaults to the
// generic "Name" for call sites that don't need to be more specific.
export function cleanName(raw: string, max = 80, label = 'Name'): string {
  const name = raw.trim()
  if (!name) throw new ConvexError(`${label} is required`)
  if (name.length > max) {
    throw new ConvexError(`${label} is too long (max ${max} characters)`)
  }
  return name
}

// A finite number within [min, max]. Rejects NaN/Infinity outright rather
// than clamping them (clamping NaN silently produces NaN again).
export function assertRange(n: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(n)) throw new ConvexError(`${label} must be a number`)
  if (n < min || n > max) {
    throw new ConvexError(`${label} must be between ${min} and ${max}`)
  }
  return n
}

// Sanity caps. Generous for real training, tight enough to stop abuse
// from degrading queries (getActive joins every set of the workout).
export const LIMITS = {
  weightKg: 1500, // beyond any world record
  reps: 500,
  setsPerExercise: 30,
  exercisesPerWorkout: 30,
  customExercisesPerUser: 300,
  routinesPerUser: 100,
  exercisesPerRoutine: 30,
  noteLength: 500,
  favoritesPerUser: 300,
  usernameMinLength: 3,
  usernameMaxLength: 20,
  friendsPerUser: 200,
  friendRequestsPerUser: 50, // pending outgoing requests
  featureRequestTextMaxLength: 1000,
  messageMaxLength: 1000,
  featureRequestsPerUser: 20,
  dailyVolumeGoalKg: 50000, // generous ceiling, same "beyond any world record" style as weightKg
  releaseVersionMaxLength: 40, // "What's new" popup version key, e.g. "1.1.0"
  // --- social feed ---
  postCaptionMaxLength: 500,
  postCommentMaxLength: 500,
  commentsPerPost: 500,
  // Guards the account-deletion transaction (which cascades every post's
  // likes, comments and reposts), not spam — that's the rate limiter's job.
  postsPerUser: 2000,
  feedPageSize: 12,
  // Past this a user's Friends feed silently omits authors. See
  // convex/feed.ts for the documented escape hatch.
  feedMaxAuthors: 40,
  reportReasonMaxLength: 300,
  blockedUsersPerUser: 200,
  challengeMinWeeks: 1,
  challengeMaxWeeks: 8,
  // Retuned from 1000 when points moved from a flat 10-per-workout award to
  // the day-based curve: a committed user now earns roughly 65-100 a week, so
  // a 1000-point wager was ten weeks of training and a 2000-point payout was
  // most of a year's.
  maxWagerPoints: 250,
} as const

// Trimmed, non-empty, length-capped free text (feature request body, etc.).
export function cleanText(raw: string, max: number, label = 'Text'): string {
  const text = raw.trim()
  if (!text) throw new ConvexError(`${label} is required`)
  if (text.length > max) throw new ConvexError(`${label} too long (max ${max} characters)`)
  return text
}

const USERNAME_PATTERN = /^[a-z0-9_]+$/

// Lowercased, trimmed, charset/length-checked. Usernames are how friends
// find each other, so they're normalized before ever touching the index.
export function cleanUsername(raw: string): string {
  const username = raw.trim().toLowerCase()
  if (
    username.length < LIMITS.usernameMinLength ||
    username.length > LIMITS.usernameMaxLength
  ) {
    throw new ConvexError(
      `Username must be ${LIMITS.usernameMinLength}-${LIMITS.usernameMaxLength} characters`,
    )
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new ConvexError('Username can only contain lowercase letters, numbers, and underscores')
  }
  return username
}

// Server-side input validation shared by all mutations.
// Convex's v.number()/v.string() validate the TYPE but not the CONTENT:
// NaN, Infinity, 1e308, or megabyte strings all pass the wire validators,
// so every mutation must sanitize what it stores.

// Trimmed, non-empty, length-capped user-facing name.
export function cleanName(raw: string, max = 80): string {
  const name = raw.trim()
  if (!name) throw new Error('Name is required')
  if (name.length > max) throw new Error(`Name too long (max ${max} characters)`)
  return name
}

// A finite number within [min, max]. Rejects NaN/Infinity outright rather
// than clamping them (clamping NaN silently produces NaN again).
export function assertRange(n: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`)
  if (n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`)
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
} as const

const USERNAME_PATTERN = /^[a-z0-9_]+$/

// Lowercased, trimmed, charset/length-checked. Usernames are how friends
// find each other, so they're normalized before ever touching the index.
export function cleanUsername(raw: string): string {
  const username = raw.trim().toLowerCase()
  if (
    username.length < LIMITS.usernameMinLength ||
    username.length > LIMITS.usernameMaxLength
  ) {
    throw new Error(
      `Username must be ${LIMITS.usernameMinLength}-${LIMITS.usernameMaxLength} characters`,
    )
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('Username can only contain lowercase letters, numbers, and underscores')
  }
  return username
}

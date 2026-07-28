/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import schema from './schema'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'

// Every runtime module in this folder, lazily imported. We then apply the
// Convex CLI's own rule in plain JS (basenames with more than one dot are
// not function modules) so *.test.ts and this helper file are excluded —
// matching what actually deploys. (extglob patterns like !(*.*.*) are not
// reliably supported by the test runner's glob, so filter manually.)
const allModules = import.meta.glob('./**/*.{js,ts}')
export const modules = Object.fromEntries(
  Object.entries(allModules).filter(([path]) => {
    const base = path.split('/').pop()!
    return (base.match(/\./g) ?? []).length <= 1
  }),
) as typeof allModules

export type T = TestConvex<typeof schema>

// Fresh in-memory backend per test.
export function createBackend(): T {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}

// Insert a user document (the auth tables are part of our schema).
export async function createUser(t: T, name: string): Promise<Id<'users'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('users', { email: `${name}@test.local` })
  })
}

// Act as a signed-in user. Convex Auth encodes the JWT subject as
// `${userId}|${sessionId}` and getAuthUserId returns the part before '|'
// (TOKEN_SUB_CLAIM_DIVIDER in @convex-dev/auth), so this identity makes
// every function see `userId` as the caller.
export function asUser(t: T, userId: Id<'users'>) {
  return t.withIdentity({ subject: `${userId}|test-session` })
}

// A built-in (global) exercise, like the seeded library rows.
export async function createBuiltInExercise(
  t: T,
  name = 'Bench Press',
): Promise<Id<'exercises'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('exercises', {
      name,
      muscleGroup: 'Chest',
      equipment: 'Barbell',
      isCustom: false,
    })
  })
}

// ---------- social fixtures ----------
// These were previously copy-pasted into most of the social test files
// (userWithUsername had seven identical definitions), so they live here now.

// A user with a username set — the state every social feature assumes, since
// onboarding captures one before any of these screens are reachable.
export async function userWithUsername(t: T, name: string) {
  const userId = await createUser(t, name)
  const user = asUser(t, userId)
  await user.mutation(api.profiles.setUsername, { username: name })
  return { userId, user }
}

// Friendship rows inserted directly, in both directions. Deliberately NOT via
// friends.sendFriendRequest/acceptFriendRequest: going through the real
// mutations would also consume that flow's rate limit and raise
// friend-request notifications, which most tests then have to filter past.
export async function makeFriends(t: T, aId: Id<'users'>, bId: Id<'users'>) {
  await t.run(async (ctx) => {
    await ctx.db.insert('friendships', { userId: aId, friendId: bId })
    await ctx.db.insert('friendships', { userId: bId, friendId: aId })
  })
}

// Two users who are already friends, the starting point for most social tests.
export async function twoFriends(t: T) {
  const alice = await userWithUsername(t, 'alice')
  const bob = await userWithUsername(t, 'bob')
  await makeFriends(t, alice.userId, bob.userId)
  return { alice, bob }
}

/**
 * Logs one completed single-set workout, optionally dated in the past.
 *
 * The backdating happens BEFORE `finish`, and that ordering is load-bearing:
 * points are bucketed by the calendar week a workout STARTED in, and finish()
 * reads `startedAt` to decide which week to credit. The two near-identical
 * copies of this helper that used to live in friends.test.ts and
 * workouts.test.ts both backdated afterwards, which under day-based scoring
 * credits the wrong week and leaves pointsAwarded inconsistent with the row's
 * own date. Shared here so there is one correct copy.
 */
export async function logWorkoutOn(
  t: T,
  user: ReturnType<typeof asUser>,
  exerciseId: Id<'exercises'>,
  opts: { daysAgo?: number; startedAt?: number; weightKg?: number; reps?: number } = {},
): Promise<Id<'workouts'>> {
  const workoutId = await user.mutation(api.workouts.start, {})
  await user.mutation(api.workouts.addExercise, { workoutId, exerciseId })

  const startedAt =
    opts.startedAt ?? Date.now() - (opts.daysAgo ?? 0) * 24 * 60 * 60 * 1000
  await t.run(async (ctx) => {
    await ctx.db.patch(workoutId, { startedAt })
  })

  const active = await user.query(api.workouts.getActive, {})
  await user.mutation(api.workouts.updateSet, {
    setId: active!.exercises[0].sets[0]._id,
    weightKg: opts.weightKg ?? 100,
    reps: opts.reps ?? 5,
    completed: true,
  })
  await user.mutation(api.workouts.finish, { workoutId })
  return workoutId
}

/** Current points balance, straight from the profile row. */
export async function pointsOf(t: T, userId: Id<'users'>): Promise<number> {
  return await t.run(async (ctx) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    return profile?.pointsBalance ?? 0
  })
}

// Tops up a points balance so challenge escrow has something to take.
export async function givePoints(t: T, userId: Id<'users'>, amount: number) {
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    await ctx.db.patch(profile!._id, { pointsBalance: (profile!.pointsBalance ?? 0) + amount })
  })
}

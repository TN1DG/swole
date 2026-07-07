/// <reference types="vite/client" />
import { convexTest, type TestConvex } from 'convex-test'
import schema from './schema'
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
  return convexTest(schema, modules)
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

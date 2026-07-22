import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

// The whole database is described here. Convex generates TypeScript types
// from this file, so queries/mutations and even the React components know
// the exact shape of every document.
export default defineSchema({
  // Tables Convex Auth needs (users, sessions, accounts, ...).
  ...authTables,

  // One per user; app-level settings + body stats for the TDEE calculator.
  profiles: defineTable({
    userId: v.id('users'),
    displayName: v.optional(v.string()),
    unitPreference: v.union(v.literal('kg'), v.literal('lb')),
    heightCm: v.optional(v.number()),
    weightKg: v.optional(v.number()),
    age: v.optional(v.number()),
    sex: v.optional(v.union(v.literal('male'), v.literal('female'))),
    activityLevel: v.optional(
      v.union(
        v.literal('sedentary'),
        v.literal('light'),
        v.literal('moderate'),
        v.literal('active'),
        v.literal('very_active'),
      ),
    ),
    // Lowercase, unique — how friends find you.
    username: v.optional(v.string()),
    // Opt-in: anyone (not just accepted friends) can view your workout history.
    workoutsPublic: v.optional(v.boolean()),
    // Set once the welcome carousel is completed (or backfilled for pre-existing
    // accounts) — gates whether OnboardingGate shows the carousel or the app.
    onboardedAt: v.optional(v.number()),
    // Which first-visit tab tips have been dismissed, so they show at most once.
    seenTips: v.optional(v.array(v.string())),
  })
    .index('by_user', ['userId'])
    .index('by_username', ['username']),

  // A pending "add friend by username" request, until accepted or declined.
  friendRequests: defineTable({
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
  })
    .index('by_to', ['toUserId'])
    .index('by_from', ['fromUserId'])
    .index('by_from_to', ['fromUserId', 'toUserId']),

  // One row per direction, so "my friends" is a single index read. Created
  // in a pair (both directions) when a friendRequest is accepted.
  friendships: defineTable({
    userId: v.id('users'),
    friendId: v.id('users'),
  })
    .index('by_user', ['userId'])
    .index('by_user_friend', ['userId', 'friendId']),

  // Built-in exercises have no ownerId; custom ones belong to a user.
  exercises: defineTable({
    ownerId: v.optional(v.id('users')),
    name: v.string(),
    muscleGroup: v.string(),
    equipment: v.optional(v.string()),
    isCustom: v.boolean(),
  }).index('by_owner', ['ownerId']),

  // A reusable workout template.
  routines: defineTable({
    ownerId: v.id('users'),
    name: v.string(),
    notes: v.optional(v.string()),
  }).index('by_owner', ['ownerId']),

  // Which exercises a routine contains, in order, with a target set count.
  routineExercises: defineTable({
    routineId: v.id('routines'),
    exerciseId: v.id('exercises'),
    position: v.number(),
    targetSets: v.number(),
  }).index('by_routine', ['routineId']),

  // One logged gym session.
  workouts: defineTable({
    ownerId: v.id('users'),
    name: v.string(),
    startedAt: v.number(), // ms since epoch (Date.now())
    endedAt: v.optional(v.number()), // undefined = still in progress
    notes: v.optional(v.string()),
  }).index('by_owner', ['ownerId']),

  // An exercise inside a workout, in order.
  workoutExercises: defineTable({
    workoutId: v.id('workouts'),
    exerciseId: v.id('exercises'),
    position: v.number(),
  })
    .index('by_workout', ['workoutId'])
    .index('by_exercise', ['exerciseId']),

  // A single set: "100 kg x 5 reps".
  sets: defineTable({
    workoutExerciseId: v.id('workoutExercises'),
    setNumber: v.number(),
    weightKg: v.number(),
    reps: v.number(),
    isWarmup: v.boolean(),
    completed: v.boolean(),
  }).index('by_workoutExercise', ['workoutExerciseId']),

  // Exercises a user has starred, for the Favorites page.
  favorites: defineTable({
    ownerId: v.id('users'),
    exerciseId: v.id('exercises'),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_exercise', ['ownerId', 'exerciseId']),

  // A user-submitted feature suggestion, emailed to the app owner on submit.
  featureRequests: defineTable({
    userId: v.id('users'),
    text: v.string(),
  }).index('by_user', ['userId']),

  // Throttles how often a verification/reset email can be sent to a given
  // address — the auth library's own rate limiter guards wrong-code guesses,
  // not "please resend my code" spam (see convex/emailAuth.ts).
  emailSendAttempts: defineTable({
    key: v.string(), // `${kind}:${email.toLowerCase()}`, kind = 'verify' | 'reset'
    windowStart: v.number(),
    count: v.number(),
  }).index('by_key', ['key']),

  // Cached best-ever numbers per user+exercise so PR checks are one read.
  personalRecords: defineTable({
    ownerId: v.id('users'),
    exerciseId: v.id('exercises'),
    bestWeightKg: v.number(),
    bestWeightReps: v.number(), // reps on the heaviest set (for "100kg x 5" display)
    bestEst1rm: v.number(), // Epley: weight * (1 + reps/30)
    achievedAt: v.number(),
    workoutId: v.id('workouts'),
  })
    .index('by_owner', ['ownerId'])
    .index('by_owner_exercise', ['ownerId', 'exerciseId']),
})

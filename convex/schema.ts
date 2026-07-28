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
    // Version of the newest "What's new" popup this user has dismissed (see
    // src/features/releases/releaseNotes.ts). Absent means they've never
    // dismissed one — which is not the same as "show them nothing", since
    // whether to show also depends on whether the account predates the
    // release. Stored per-account rather than in localStorage so it doesn't
    // reappear on every device, matching seenTips above.
    lastSeenRelease: v.optional(v.string()),
    // Single global target for the History calendar's daily rings.
    dailyVolumeGoalKg: v.optional(v.number()),
    // Earned by finishing workouts, spent/won via challenges (convex/challenges.ts).
    pointsBalance: v.optional(v.number()),
    // Uploaded + cropped on the client (see src/features/profile/
    // AvatarUploadDialog.tsx). Visible to the owner and their friends only.
    avatarStorageId: v.optional(v.id('_storage')),
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

  // Snapchat-style accountability pings between friends.
  gymPings: defineTable({
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
    sentAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
    linkedWorkoutId: v.optional(v.id('workouts')),
    // Sender dismissed the "start your workout?" banner for this ack.
    senderPromptDismissedAt: v.optional(v.number()),
  })
    .index('by_from_to', ['fromUserId', 'toUserId'])
    .index('by_to', ['toUserId'])
    .index('by_from', ['fromUserId']),

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

  // Free-text chat between friends. Same shape/index style as gymPings —
  // both are one-directional events between a friend pair, and the chat
  // thread reads them the same way (both directions, merged).
  messages: defineTable({
    fromUserId: v.id('users'),
    toUserId: v.id('users'),
    text: v.string(),
    sentAt: v.number(),
  })
    .index('by_from_to', ['fromUserId', 'toUserId'])
    .index('by_to', ['toUserId'])
    .index('by_from', ['fromUserId']),

  // How far through a friend's thread I've read. One row per (viewer,
  // friend) — deliberately NOT per-message read receipts, which would cost a
  // row per message to answer the one question the UI actually asks ("is
  // there anything new from this friend?").
  threadReads: defineTable({
    userId: v.id('users'), // the reader
    friendId: v.id('users'),
    lastReadAt: v.number(),
  }).index('by_user_friend', ['userId', 'friendId']),

  // In-app notifications (no OS/push delivery — see docs/new-features-progress.md).
  // One generalized table rather than a bespoke reactive query per feature,
  // which is the pattern friends.ts/pings.ts grew organically and which
  // doesn't scale to a cross-cutting concern like this.
  notifications: defineTable({
    userId: v.id('users'), // recipient
    kind: v.union(
      v.literal('friend_request_received'),
      v.literal('friend_request_accepted'),
      v.literal('ping_received'),
      v.literal('workout_finished_after_ping'), // "X won the battle"
    ),
    fromUserId: v.id('users'), // who caused it
    createdAt: v.number(),
    readAt: v.optional(v.number()), // unset = unread
    // Only set for the kinds that need them, so the banner can deep-link.
    pingId: v.optional(v.id('gymPings')),
    workoutId: v.optional(v.id('workouts')),
  })
    // Serves both "my unread" (eq userId + eq readAt undefined) and
    // "all mine" (userId prefix only, for account deletion).
    .index('by_user_readAt', ['userId', 'readAt'])
    // Only used by account deletion, to clear the notices a departing user
    // left in other people's banners (which would otherwise render as
    // "Someone" once their user document is gone).
    .index('by_fromUser', ['fromUserId']),

  // A friend-vs-friend consistency-streak wager, started from the ping
  // thread. Points are escrowed off both balances as soon as each side
  // commits (propose/accept), not just at resolution — see convex/challenges.ts.
  challenges: defineTable({
    challengerId: v.id('users'),
    opponentId: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('active'),
      v.literal('resolved'),
      v.literal('declined'),
      v.literal('cancelled'),
    ),
    weeks: v.number(),
    wagerPoints: v.number(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()), // set on accept
    endsAt: v.optional(v.number()), // startedAt + weeks * WEEK_MS
    resolvedAt: v.optional(v.number()),
    winnerId: v.optional(v.id('users')), // absent + resolved = tie
    challengerStreakWeeks: v.optional(v.number()),
    opponentStreakWeeks: v.optional(v.number()),
  })
    .index('by_challenger', ['challengerId'])
    .index('by_opponent', ['opponentId'])
    .index('by_status_endsAt', ['status', 'endsAt']),

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

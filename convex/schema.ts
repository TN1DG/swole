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
    // Swole Points: earned per distinct training day (see convex/fitness.ts
    // and convex/points.ts), spent and won via challenges.
    //
    // Invariant, holding from the scoring rework forward:
    //   pointsBalance == sum(workouts.pointsAwarded) - challenge spend
    // Balances predating that rework are grandfathered rather than
    // re-derived — they may already be escrowed in a live challenge, and
    // recalculating could take points off someone mid-wager.
    pointsBalance: v.optional(v.number()),
    // Uploaded + cropped on the client (see src/features/profile/
    // AvatarUploadDialog.tsx). Visible to the owner and their friends only.
    avatarStorageId: v.optional(v.id('_storage')),
  })
    .index('by_user', ['userId'])
    .index('by_username', ['username']),

  // ---------- social feed ----------

  // A shared workout — the unit of the feed. Denormalized hard, on purpose:
  // a page renders 20 of these, and history.summarizeWorkout costs ~1+2N
  // reads per workout, so re-deriving each one would be 200+ reads before a
  // single pixel. Everything under "snapshot" is copied at post time and
  // deliberately NOT kept in sync afterwards — a post is something you
  // published, not a live view of a workout you may since have edited.
  posts: defineTable({
    authorId: v.id('users'),
    createdAt: v.number(),
    // Chosen per post by the author; the composer preselects 'friends'.
    // Immutable after creation — see feed.ts:repost for why flipping this
    // later would turn every existing repost into a leak.
    visibility: v.union(v.literal('public'), v.literal('friends')),
    caption: v.optional(v.string()),
    photoStorageId: v.optional(v.id('_storage')),

    // Optional because a repost has no workout of its own, and because
    // history.deleteWorkout unlinks rather than destroying the post.
    workoutId: v.optional(v.id('workouts')),

    // ---- snapshot, copied from the workout at post time ----
    workoutName: v.optional(v.string()),
    workoutStartedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    volumeKg: v.optional(v.number()),
    setCount: v.optional(v.number()),
    prCount: v.optional(v.number()),
    // Bounded by LIMITS.exercisesPerWorkout (30), so this can't run away.
    exerciseNames: v.optional(v.array(v.string())),

    // Points at the ORIGINAL, never at another repost — repost() collapses
    // the chain, so the embed is at most one level deep and never nests.
    repostOfId: v.optional(v.id('posts')),

    // Denormalized counters, patched in the same mutation as the child row.
    // Never counted from rows: Convex has no count operator and
    // .collect().length is the anti-pattern its guidelines call out. Kept on
    // the post rather than a sibling table because the feed reads the post
    // anyway — splitting them adds a read per post without avoiding the
    // reactive invalidation that would motivate the split.
    //
    // If a post ever gets hot enough to see OCC retries, the escape hatch is
    // @convex-dev/aggregate or a sharded counter table.
    likeCount: v.number(),
    commentCount: v.number(),
    repostCount: v.number(),
  })
    // The Friends-feed merge stream. Prefix-usable: authorId alone also
    // serves "all my posts" and the account-deletion sweep.
    .index('by_author_createdAt', ['authorId', 'createdAt'])
    // The Discover stream, and the only index that reads visibility.
    .index('by_visibility_createdAt', ['visibility', 'createdAt'])
    // "have I already shared this workout?" + the unlink on workout deletion.
    .index('by_workout', ['workoutId'])
    // Deleting an original has to clean up everyone's reposts of it.
    .index('by_repostOf', ['repostOfId']),

  // One like. A row rather than a counter-only design because "did I like
  // this" has to be answerable per viewer.
  postLikes: defineTable({
    postId: v.id('posts'),
    userId: v.id('users'),
    createdAt: v.number(),
  })
    // "who liked this", and the cascade when a post is deleted.
    .index('by_post', ['postId'])
    // Serves both the per-post "did I like it" point lookup and, on the
    // userId prefix alone, "every like I ever left" for account deletion —
    // the same two-for-one shape as notifications' by_user_readAt.
    .index('by_user_post', ['userId', 'postId']),

  postComments: defineTable({
    postId: v.id('posts'),
    authorId: v.id('users'),
    text: v.string(),
    createdAt: v.number(),
  })
    // The thread, oldest-first; the postId prefix alone serves post deletion.
    .index('by_post_createdAt', ['postId', 'createdAt'])
    // Account deletion, the other direction: my comments on other's posts.
    .index('by_author', ['authorId']),

  // A user-filed report. There is deliberately no moderator UI and no query
  // over this table — reports are read from the Convex dashboard and emailed
  // to the owner, exactly like featureRequests.
  postReports: defineTable({
    postId: v.id('posts'),
    reporterId: v.id('users'),
    reason: v.string(),
    createdAt: v.number(),
  })
    .index('by_post', ['postId'])
    .index('by_reporter', ['reporterId']),

  // One-directional: blocking hides them from me, and does not tell them.
  // Deliberately not stored as a pair the way friendships are — the two
  // directions mean different things and are set independently.
  blockedUsers: defineTable({
    userId: v.id('users'), // the blocker
    blockedUserId: v.id('users'),
    createdAt: v.number(),
  })
    // Point lookup, and on the userId prefix "everyone I've blocked".
    .index('by_user_blocked', ['userId', 'blockedUserId'])
    // Account deletion, the other direction.
    .index('by_blocked', ['blockedUserId']),

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

    // Stamped by workouts.finish, which already walks every set to compute
    // them. Denormalized so the scoring and leaderboard reads never have to
    // re-walk workoutExercises -> sets: history.summarizeWorkout costs ~1+2N
    // reads per workout, and the leaderboard was paying that for every
    // workout of every friend on every render.
    //
    // Optional because rows finished before this shipped don't have them.
    // convex/migrations.ts backfills recent ones; older rows read as 0 and
    // nothing the UI shows ever sums them.
    volumeKg: v.optional(v.number()),
    setCount: v.optional(v.number()),
    prCount: v.optional(v.number()),

    // What this workout credited to profiles.pointsBalance. The unit of
    // account for the whole points system: a week's leaderboard score is a
    // SUM of this field over a date range, so a rank can never disagree with
    // the balance it came from. Only points.ts:reconcileWeek may write it.
    pointsAwarded: v.optional(v.number()),
  })
    .index('by_owner', ['ownerId'])
    // Every scoring read is "this owner, this date range". Prefix-usable, so
    // it also covers everything by_owner does.
    .index('by_owner_startedAt', ['ownerId', 'startedAt']),

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
      v.literal('post_liked'),
      v.literal('post_commented'),
      v.literal('post_reposted'),
    ),
    fromUserId: v.id('users'), // who caused it
    createdAt: v.number(),
    readAt: v.optional(v.number()), // unset = unread
    // Only set for the kinds that need them, so the banner can deep-link.
    pingId: v.optional(v.id('gymPings')),
    workoutId: v.optional(v.id('workouts')),
    postId: v.optional(v.id('posts')),
    // How many people this notice stands for after coalescing, so a busy
    // post says "X and 4 others" instead of burying everything else in the
    // 3-slot banner stack. Unset means 1.
    count: v.optional(v.number()),
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

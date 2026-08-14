import { v, ConvexError } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { assertRange, cleanName, cleanUsername, LIMITS } from './validation'
import {
  consistencyTier,
  displayStreakWeeks,
  utcMonthEnd,
  utcMonthStart,
  utcWeekEnd,
  utcWeekIndex,
  utcWeekStart,
  WEEK_MS,
} from './fitness'
import { rateLimiter, requireWriter } from './rateLimiter'

// Cap on how many first-visit tips we'll remember dismissing — one per main
// tab, generous headroom for future tabs without growing unbounded.
const MAX_SEEN_TIPS = 20

// Plausibility bounds for the body-stats form — not abuse prevention (there's
// no query-cost concern here), just sane limits for a calorie calculator.
const STATS_BOUNDS = {
  heightCm: [50, 260] as const,
  weightKg: [20, 400] as const,
  age: [13, 120] as const,
}

// No profile row exists until the user first sets something (display name or
// unit preference) — create one on demand instead of on every sign-up.
// Exported: workouts.ts (points-on-finish) and challenges.ts (escrow) both
// need to read-or-create a profile the same way this file's own mutations do.
export async function getOrCreateProfile(ctx: MutationCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (existing) return existing

  const id = await ctx.db.insert('profiles', { userId, unitPreference: 'kg' })
  return (await ctx.db.get(id))!
}

// Credits a user's consistency-points balance — workouts.ts (finish) and
// challenges.ts (refunds, payouts) both call this rather than patching
// profiles directly, so the balance math stays in one place.
export async function awardPoints(ctx: MutationCtx, userId: Id<'users'>, amount: number) {
  const profile = await getOrCreateProfile(ctx, userId)
  await ctx.db.patch(profile._id, { pointsBalance: (profile.pointsBalance ?? 0) + amount })
}

// Moves a balance by a signed amount, floored at zero.
//
// Unlike escrowPoints this never throws on insufficient funds, because its
// caller is the workout-delete clawback (points.ts:reconcileWeek). The points
// being clawed back may already be escrowed in a live challenge, and failing
// somebody's delete because of that would be unexplainable — they just wanted
// to remove a mis-logged session. Clawing back only as far as the balance
// allows is the lesser evil.
export async function adjustPoints(ctx: MutationCtx, userId: Id<'users'>, delta: number) {
  const profile = await getOrCreateProfile(ctx, userId)
  const next = Math.max(0, (profile.pointsBalance ?? 0) + delta)
  await ctx.db.patch(profile._id, { pointsBalance: next })
}

// Debits a balance, throwing if it can't cover the amount — challenges.ts
// calls this at propose/accept time to escrow a wager up front, so a
// balance always reflects what's actually still spendable right now.
export async function escrowPoints(ctx: MutationCtx, userId: Id<'users'>, amount: number) {
  const profile = await getOrCreateProfile(ctx, userId)
  const balance = profile.pointsBalance ?? 0
  if (balance < amount) throw new ConvexError('Not enough points')
  await ctx.db.patch(profile._id, { pointsBalance: balance - amount })
}

// Everything the profile screen shows: identity, and a few cheap lifetime
// counts (not the heavier "total volume ever" — that would mean scanning
// every set of every workout just to render a number).
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    // Everything derived from workouts below — the streak, and this week's and
    // month's points — only looks back a year. So read a year, not a lifetime.
    //
    // This used to `.collect()` the whole by_owner index, so opening your own
    // profile got more expensive with every workout you ever logged and would
    // eventually trip Convex's per-transaction read limit. The lifetime total
    // is the one thing that genuinely needed all the rows, and it now comes
    // from a counter (profiles.workoutsCompleted) instead of a scan.
    const now = Date.now()
    const OWN_LOOKBACK_WEEKS = 52
    const lookbackStart = utcWeekStart(now) - OWN_LOOKBACK_WEEKS * WEEK_MS

    // Five independent reads — run them together instead of one at a time.
    const [user, profile, workouts, prs, favorites] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
      ctx.db
        .query('workouts')
        .withIndex('by_owner_startedAt', (q) =>
          q.eq('ownerId', userId).gte('startedAt', lookbackStart),
        )
        .collect(),
      ctx.db
        .query('personalRecords')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .collect(),
      ctx.db
        .query('favorites')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
        .collect(),
    ])

    const completedWorkouts = workouts.filter((w) => w.endedAt !== undefined)

    // Your own streak can afford a longer lookback than the leaderboard's —
    // that's one user's rows, not one per friend — so a long streak shows a
    // real number here rather than being capped. The lookback is applied by the
    // indexed read above now, so there's nothing left to filter out here.
    const trainedWeeks = new Set(completedWorkouts.map((w) => utcWeekIndex(w.startedAt)))
    const streakWeeks = displayStreakWeeks(trainedWeeks, utcWeekIndex(now))
    const tier = consistencyTier(streakWeeks)

    // Shown next to the balance. Without both numbers on screen, people read
    // the coin count as their leaderboard rank — the board ranks on points
    // EARNED in the period, the balance is what's left after wagers.
    const sumAwarded = (from: number, to: number) =>
      completedWorkouts
        .filter((w) => w.startedAt >= from && w.startedAt < to)
        .reduce((sum, w) => sum + (w.pointsAwarded ?? 0), 0)
    const weekPoints = sumAwarded(utcWeekStart(now), utcWeekEnd(now))
    const monthPoints = sumAwarded(utcMonthStart(now), utcMonthEnd(now))

    return {
      email: user?.email ?? null,
      avatarUrl: profile?.avatarStorageId
        ? await ctx.storage.getUrl(profile.avatarStorageId)
        : null,
      displayName: profile?.displayName ?? null,
      unitPreference: profile?.unitPreference ?? 'kg',
      memberSince: user?._creationTime ?? Date.now(),
      // Lifetime, from the counter — `completedWorkouts` above is only the
      // last year and would silently under-report it.
      workoutCount: profile?.workoutsCompleted ?? 0,
      prCount: prs.length,
      favoriteCount: favorites.length,
      heightCm: profile?.heightCm ?? null,
      weightKg: profile?.weightKg ?? null,
      age: profile?.age ?? null,
      sex: profile?.sex ?? null,
      activityLevel: profile?.activityLevel ?? null,
      dailyVolumeGoalKg: profile?.dailyVolumeGoalKg ?? null,
      pointsBalance: profile?.pointsBalance ?? 0,
      weekPoints,
      monthPoints,
      username: profile?.username ?? null,
      workoutsPublic: profile?.workoutsPublic ?? false,
      lastSeenRelease: profile?.lastSeenRelease ?? null,
      onboarded: profile?.onboardedAt != null,
      streakWeeks,
      tier,
    }
  },
})

// One-time (well, changeable) handle — how friends find you. Lowercase and
// unique; the friends feature is unusable until this is set.
export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const username = cleanUsername(args.username)

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (existing && existing.userId !== userId) {
      throw new ConvexError('That username is taken — try another one')
    }

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { username })
  },
})

// The welcome carousel's identity step. Deliberately does NOT mark onboarding
// done — the carousel still has the stats questionnaire and reward screen
// to go, and OnboardingGate would otherwise drop straight into the app the
// moment this call lands. See `finishOnboarding` for that.
export const saveOnboardingIdentity = mutation({
  args: { username: v.string(), displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const username = cleanUsername(args.username)
    const displayName = cleanName(args.displayName, 40, 'Display name')

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (existing && existing.userId !== userId) {
      throw new ConvexError('That username is taken — try another one')
    }

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { username, displayName })
  },
})

// The carousel's very last step (after the reward screen) — this is what
// actually gates OnboardingGate.
export const finishOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { onboardedAt: Date.now() })
  },
})

// Which first-visit tab tips this user has already dismissed.
export const getSeenTips = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return []
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique()
    return profile?.seenTips ?? []
  },
})

export const markTipSeen = mutation({
  args: { tip: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const profile = await getOrCreateProfile(ctx, userId)
    const seen = profile.seenTips ?? []
    if (seen.includes(args.tip) || seen.length >= MAX_SEEN_TIPS) return
    await ctx.db.patch(profile._id, { seenTips: [...seen, args.tip] })
  },
})

// Records that the user dismissed the "What's new" popup for this release,
// so it doesn't come back on their next visit or their other devices.
//
// The version is whatever the client's bundle calls the current release
// (src/features/releases/releaseNotes.ts). A tampered-with client can only
// suppress or re-show its own popup, so this is length-capped rather than
// checked against a server-side list of known versions — the server has no
// reason to know the release history.
export const markReleaseSeen = mutation({
  args: { version: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const version = cleanName(args.version, LIMITS.releaseVersionMaxLength, 'Version')
    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { lastSeenRelease: version })
  },
})

// Opt in/out of letting anyone (not just accepted friends) see your workouts.
export const setWorkoutsPublic = mutation({
  args: { workoutsPublic: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { workoutsPublic: args.workoutsPublic })
  },
})

// Largest avatar blob we'll keep. The client crops to a small square JPEG
// (see src/lib/cropImage.ts), so anything near this ceiling means the upload
// didn't come from our own UI.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

// Step 1 of the avatar flow: mint a one-shot upload URL. Rate-limited because
// each call is permission to write a blob, and a client that never follows up
// with setAvatar leaves an orphaned file behind.
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'avatarUploadUrl', { key: userId, throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

// Step 2: adopt an uploaded blob as this user's avatar. The upload URL itself
// can't enforce type or size, so both are checked here.
//
// Returns `{ ok: false, error }` on a bad upload rather than throwing, and
// this is load-bearing: a Convex mutation is all-or-nothing, so throwing
// AFTER `ctx.storage.delete(...)` would roll the delete back too and leave
// the rejected blob orphaned in storage forever. Returning lets the cleanup
// commit. (The client turns a false result back into a thrown error — see
// AvatarUploadDialog.)
export const setAvatar = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const userId = await requireWriter(ctx)

    const metadata = await ctx.db.system.get('_storage', args.storageId)
    if (!metadata) return { ok: false, error: 'Upload not found — try again' }

    // `contentType` comes from the client's own upload header, so it is NOT a
    // security boundary — anyone malicious just claims "image/png". It's
    // checked to catch honest mistakes (picking a PDF), which is why a
    // *missing* type is tolerated rather than rejected: refusing it would buy
    // nothing an attacker can't sidestep, while breaking any uploader that
    // omits the header. `size` is measured server-side, so that one is real.
    const wrongType =
      metadata.contentType !== undefined && !metadata.contentType.startsWith('image/')
    if (wrongType || metadata.size > MAX_AVATAR_BYTES) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'That file needs to be an image under 5MB' }
    }

    const profile = await getOrCreateProfile(ctx, userId)
    // Replacing an avatar should not leave the old blob behind paying rent.
    if (profile.avatarStorageId) {
      await ctx.storage.delete(profile.avatarStorageId)
    }
    await ctx.db.patch(profile._id, { avatarStorageId: args.storageId })
    return { ok: true }
  },
})

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)

    const profile = await getOrCreateProfile(ctx, userId)
    if (!profile.avatarStorageId) return
    await ctx.storage.delete(profile.avatarStorageId)
    await ctx.db.patch(profile._id, { avatarStorageId: undefined })
  },
})

// Display-only preference — height/weight are always stored canonically as
// cm/kg (see updateBodyStats below), as are set weights. This controls how
// every weight in the app is *rendered*: the body-stats forms (Stats page and
// the onboarding slide) switch between cm/kg and ft+in/lb, and every other
// weight on screen goes through useWeightUnit().
//
// Uses getOrCreateProfile, so it is safe to call during onboarding, before
// the user has a profile row.
export const setUnitPreference = mutation({
  args: { unitPreference: v.union(v.literal('kg'), v.literal('lb')) },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { unitPreference: args.unitPreference })
  },
})

// Body stats for the My Stats / TDEE calculator page. All five are required
// together — the calorie math needs every one of them to mean anything.
export const updateBodyStats = mutation({
  args: {
    heightCm: v.number(),
    weightKg: v.number(),
    age: v.number(),
    sex: v.union(v.literal('male'), v.literal('female')),
    activityLevel: v.union(
      v.literal('sedentary'),
      v.literal('light'),
      v.literal('moderate'),
      v.literal('active'),
      v.literal('very_active'),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const heightCm = assertRange(args.heightCm, ...STATS_BOUNDS.heightCm, 'Height')
    const weightKg = assertRange(args.weightKg, ...STATS_BOUNDS.weightKg, 'Weight')
    const age = Math.round(assertRange(args.age, ...STATS_BOUNDS.age, 'Age'))

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, {
      heightCm,
      weightKg,
      age,
      sex: args.sex,
      activityLevel: args.activityLevel,
    })
  },
})

// Single global target for the History calendar's daily rings.
export const setDailyVolumeGoal = mutation({
  args: { dailyVolumeGoalKg: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const goal = assertRange(args.dailyVolumeGoalKg, 1, LIMITS.dailyVolumeGoalKg, 'Daily goal')
    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { dailyVolumeGoalKg: goal })
  },
})

// Empty string clears it (falls back to showing the email instead).
export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const trimmed = args.displayName.trim()
    if (trimmed.length > 40) {
      throw new ConvexError('Display name is too long (max 40 characters)')
    }

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { displayName: trimmed || undefined })
  },
})

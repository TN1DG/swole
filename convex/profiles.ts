import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { assertRange, cleanName, cleanUsername } from './validation'

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
async function getOrCreateProfile(ctx: MutationCtx, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique()
  if (existing) return existing

  const id = await ctx.db.insert('profiles', { userId, unitPreference: 'kg' })
  return (await ctx.db.get(id))!
}

// Everything the profile screen shows: identity, and a few cheap lifetime
// counts (not the heavier "total volume ever" — that would mean scanning
// every set of every workout just to render a number).
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null

    // Five independent reads — run them together instead of one at a time.
    const [user, profile, workouts, prs, favorites] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
      ctx.db
        .query('workouts')
        .withIndex('by_owner', (q) => q.eq('ownerId', userId))
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

    return {
      email: user?.email ?? null,
      displayName: profile?.displayName ?? null,
      unitPreference: profile?.unitPreference ?? 'kg',
      memberSince: user?._creationTime ?? Date.now(),
      workoutCount: workouts.filter((w) => w.endedAt !== undefined).length,
      prCount: prs.length,
      favoriteCount: favorites.length,
      heightCm: profile?.heightCm ?? null,
      weightKg: profile?.weightKg ?? null,
      age: profile?.age ?? null,
      sex: profile?.sex ?? null,
      activityLevel: profile?.activityLevel ?? null,
      username: profile?.username ?? null,
      workoutsPublic: profile?.workoutsPublic ?? false,
      onboarded: profile?.onboardedAt != null,
    }
  },
})

// One-time (well, changeable) handle — how friends find you. Lowercase and
// unique; the friends feature is unusable until this is set.
export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const username = cleanUsername(args.username)

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (existing && existing.userId !== userId) {
      throw new Error('That username is taken')
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
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const username = cleanUsername(args.username)
    const displayName = cleanName(args.displayName, 40)

    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (existing && existing.userId !== userId) {
      throw new Error('That username is taken')
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
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

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
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const profile = await getOrCreateProfile(ctx, userId)
    const seen = profile.seenTips ?? []
    if (seen.includes(args.tip) || seen.length >= MAX_SEEN_TIPS) return
    await ctx.db.patch(profile._id, { seenTips: [...seen, args.tip] })
  },
})

// Opt in/out of letting anyone (not just accepted friends) see your workouts.
export const setWorkoutsPublic = mutation({
  args: { workoutsPublic: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { workoutsPublic: args.workoutsPublic })
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
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

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

// Empty string clears it (falls back to showing the email instead).
export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const trimmed = args.displayName.trim()
    if (trimmed.length > 40) throw new Error('Name too long (max 40 characters)')

    const profile = await getOrCreateProfile(ctx, userId)
    await ctx.db.patch(profile._id, { displayName: trimmed || undefined })
  },
})

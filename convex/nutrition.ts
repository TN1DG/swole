import { v, ConvexError } from 'convex/values'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getAuthUserId } from '@convex-dev/auth/server'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { assertRange, LIMITS } from './validation'
import { rateLimiter, requireWriter } from './rateLimiter'
import { caloriesFromMacros, DAY_MS, utcDayIndex } from './fitness'

/**
 * Food logging for the Caloric Consistency page: manual entries, and photos
 * analyzed by a vision model through the Vercel AI Gateway.
 *
 * The photo flow follows the same two-step upload shape as avatars/post
 * photos (mint a URL, client PUTs the blob, adopt the storageId), plus a
 * third step this feature is the first to need: an `action` that reads the
 * blob back out, sends it to an external vision model, and writes the
 * structured result back through a mutation (actions have no `ctx.db`).
 */

// Largest food photo we'll keep — same ceiling as post photos (feed.ts).
const MAX_FOOD_PHOTO_BYTES = 8 * 1024 * 1024

// Vision-capable model, routed through the Vercel AI Gateway (see
// AI_GATEWAY_API_KEY below). One named constant so swapping models later is
// a one-line change — check `curl https://ai-gateway.vercel.sh/v1/models`
// for what's current before changing it.
const FOOD_PHOTO_MODEL = 'anthropic/claude-haiku-4.5'

/**
 * Read a Convex deployment environment variable.
 * See convex/turnstile.ts:envVar for why this goes through `globalThis`
 * rather than the bare `process` global — this file exports a public action,
 * which puts it in the `api` surface `src` imports (no Node types there).
 */
function envVar(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ]
}

const FoodAnalysisSchema = z.object({
  description: z.string(),
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
})

const EMPTY_TOTALS = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }

function todayRange(now: number): { start: number; end: number } {
  const start = utcDayIndex(now) * DAY_MS
  return { start, end: start + DAY_MS }
}

// A finite number can't be trusted from an LLM the way it can from a form —
// there's no user to show a validation error to. Clamp rather than throw, so
// a merely-generous estimate still saves instead of stranding the entry
// `pending` forever.
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

async function assertUnderDailyCap(ctx: MutationCtx, ownerId: Id<'users'>, now: number) {
  const { start, end } = todayRange(now)
  const todaysCount = await ctx.db
    .query('foodLogs')
    .withIndex('by_owner_loggedAt', (q) =>
      q.eq('ownerId', ownerId).gte('loggedAt', start).lt('loggedAt', end),
    )
    .collect()
  if (todaysCount.length >= LIMITS.foodLogsPerDay) {
    throw new ConvexError("You've logged the max entries for today")
  }
}

// Step 1 of the photo flow: mint a one-shot upload URL. Rate-limited for the
// same reason as avatarUploadUrl — each call is permission to write a blob.
export const generateFoodPhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireWriter(ctx)
    await rateLimiter.limit(ctx, 'foodPhotoUploadUrl', { key: userId, throws: true })
    return await ctx.storage.generateUploadUrl()
  },
})

// Step 2: adopt an uploaded blob as a pending food-log entry. Returns
// `{ ok: false, error }` on a bad upload rather than throwing, for the same
// reason setAvatar does — throwing after ctx.storage.delete would roll the
// delete back too and leave the rejected blob orphaned.
export const logPhotoEntry = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; foodLogId: Id<'foodLogs'> } | { ok: false; error: string }> => {
    const userId = await requireWriter(ctx)

    const metadata = await ctx.db.system.get('_storage', args.storageId)
    if (!metadata) return { ok: false, error: 'Upload not found — try again' }

    const wrongType =
      metadata.contentType !== undefined && !metadata.contentType.startsWith('image/')
    if (wrongType || metadata.size > MAX_FOOD_PHOTO_BYTES) {
      await ctx.storage.delete(args.storageId)
      return { ok: false, error: 'That file needs to be a photo under 8MB' }
    }

    const now = Date.now()
    await assertUnderDailyCap(ctx, userId, now)

    const foodLogId = await ctx.db.insert('foodLogs', {
      ownerId: userId,
      loggedAt: now,
      source: 'photo',
      status: 'pending',
      photoStorageId: args.storageId,
    })
    return { ok: true, foodLogId }
  },
})

// Step 3: send the uploaded photo to a vision model and save what comes
// back. Public (not internal) because the client calls it directly with
// `useAction` and awaits the result to fill the on-screen input boxes —
// unlike featureRequests.ts's fire-and-forget scheduled action, the UI here
// needs the answer, not just the side effect.
export const analyzeFoodPhoto = action({
  args: { foodLogId: v.id('foodLogs'), storageId: v.id('_storage') },
  handler: async (ctx, args): Promise<z.infer<typeof FoodAnalysisSchema>> => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new ConvexError('Not signed in')
    await rateLimiter.limit(ctx, 'foodPhotoAnalyze', { key: userId, throws: true })

    // Actions have no ctx.db, so ownership is checked via an internal query
    // rather than a direct get — same "bind the args to each other and to
    // the caller" shape saveAnalysis/markAnalysisFailed already use below,
    // just applied before the read+external-call instead of only at the
    // write. Without this, any signed-in caller could point storageId at a
    // blob outside their own upload and get it described by the vision
    // model on the app's dime.
    const entry = await ctx.runQuery(internal.nutrition.getEntryForAnalysis, {
      foodLogId: args.foodLogId,
    })
    if (!entry || entry.ownerId !== userId || entry.photoStorageId !== args.storageId) {
      throw new ConvexError('Entry not found')
    }

    // Not configured on this deployment (e.g. a fresh preview — see
    // docs/domain-and-environments-plan.md for the same trap with auth env
    // vars) — fail with a message the UI can show, not an opaque error.
    if (!envVar('AI_GATEWAY_API_KEY')) {
      await ctx.runMutation(internal.nutrition.markAnalysisFailed, {
        foodLogId: args.foodLogId,
        ownerId: userId,
      })
      throw new ConvexError(
        'Food photo analysis is not set up on this deployment — log it manually instead.',
      )
    }

    const photoUrl = await ctx.storage.getUrl(args.storageId)
    if (!photoUrl) {
      await ctx.runMutation(internal.nutrition.markAnalysisFailed, {
        foodLogId: args.foodLogId,
        ownerId: userId,
      })
      throw new ConvexError('Could not read that photo — try again.')
    }

    let analysis: z.infer<typeof FoodAnalysisSchema>
    try {
      const result = await generateText({
        model: FOOD_PHOTO_MODEL,
        output: Output.object({ schema: FoodAnalysisSchema }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Estimate the nutritional content of the food shown in this photo. Use visual cues (plate size, portion, container) to judge quantity, and give one best-guess estimate rather than a range.',
              },
              { type: 'file', data: new URL(photoUrl), mediaType: 'image' },
            ],
          },
        ],
      })
      analysis = result.output
    } catch {
      await ctx.runMutation(internal.nutrition.markAnalysisFailed, {
        foodLogId: args.foodLogId,
        ownerId: userId,
      })
      throw new ConvexError('Could not analyze that photo just now — log it manually instead.')
    }

    const clamped = {
      description: analysis.description.trim().slice(0, LIMITS.foodDescriptionMaxLength) || 'Food',
      calories: clamp(analysis.calories, 0, LIMITS.calories),
      proteinG: clamp(analysis.proteinG, 0, LIMITS.macroGrams),
      carbsG: clamp(analysis.carbsG, 0, LIMITS.macroGrams),
      fatG: clamp(analysis.fatG, 0, LIMITS.macroGrams),
      fiberG: clamp(analysis.fiberG, 0, LIMITS.macroGrams),
    }
    await ctx.runMutation(internal.nutrition.saveAnalysis, {
      foodLogId: args.foodLogId,
      ownerId: userId,
      ...clamped,
    })
    return { ...clamped, confidence: analysis.confidence }
  },
})

/** Ownership lookup for analyzeFoodPhoto. Internal: actions have no ctx.db. */
export const getEntryForAnalysis = internalQuery({
  args: { foodLogId: v.id('foodLogs') },
  handler: async (ctx, args) => await ctx.db.get(args.foodLogId),
})

/** Writes a completed analysis. Internal: only analyzeFoodPhoto may call it. */
export const saveAnalysis = internalMutation({
  args: {
    foodLogId: v.id('foodLogs'),
    ownerId: v.id('users'),
    description: v.string(),
    calories: v.number(),
    proteinG: v.number(),
    carbsG: v.number(),
    fatG: v.number(),
    fiberG: v.number(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.foodLogId)
    if (!entry || entry.ownerId !== args.ownerId) return
    await ctx.db.patch(args.foodLogId, {
      status: 'complete',
      description: args.description,
      calories: args.calories,
      proteinG: args.proteinG,
      carbsG: args.carbsG,
      fatG: args.fatG,
      fiberG: args.fiberG,
    })
  },
})

/** Marks a photo entry as failed so it stops showing "analyzing…" forever. */
export const markAnalysisFailed = internalMutation({
  args: { foodLogId: v.id('foodLogs'), ownerId: v.id('users') },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.foodLogId)
    if (!entry || entry.ownerId !== args.ownerId) return
    await ctx.db.patch(args.foodLogId, { status: 'failed' })
  },
})

// A hand-typed entry — no photo, complete immediately. At least one field is
// required; any omitted macro is simply not counted toward today's totals.
// A calorie count isn't required: if it's omitted but a macro was given, it's
// derived from the macros (4/4/9) so the day's calorie total stays honest
// whatever the client sent.
export const logManualEntry = mutation({
  args: {
    description: v.optional(v.string()),
    calories: v.optional(v.number()),
    proteinG: v.optional(v.number()),
    carbsG: v.optional(v.number()),
    fatG: v.optional(v.number()),
    fiberG: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    if (
      args.calories === undefined &&
      args.proteinG === undefined &&
      args.carbsG === undefined &&
      args.fatG === undefined &&
      args.fiberG === undefined
    ) {
      throw new ConvexError('Enter at least one value')
    }

    const proteinG =
      args.proteinG !== undefined
        ? assertRange(args.proteinG, 0, LIMITS.macroGrams, 'Protein')
        : undefined
    const carbsG =
      args.carbsG !== undefined
        ? assertRange(args.carbsG, 0, LIMITS.macroGrams, 'Carbs')
        : undefined
    const fatG =
      args.fatG !== undefined ? assertRange(args.fatG, 0, LIMITS.macroGrams, 'Fat') : undefined
    const hasMacro = proteinG !== undefined || carbsG !== undefined || fatG !== undefined
    const calories =
      args.calories !== undefined
        ? assertRange(args.calories, 0, LIMITS.calories, 'Calories')
        : hasMacro
          ? assertRange(
              caloriesFromMacros(proteinG ?? 0, carbsG ?? 0, fatG ?? 0),
              0,
              LIMITS.calories,
              'Calories',
            )
          : undefined

    const now = Date.now()
    await assertUnderDailyCap(ctx, userId, now)

    await ctx.db.insert('foodLogs', {
      ownerId: userId,
      loggedAt: now,
      source: 'manual',
      status: 'complete',
      description: args.description?.trim()
        ? args.description.trim().slice(0, LIMITS.foodDescriptionMaxLength)
        : undefined,
      calories,
      proteinG,
      carbsG,
      fatG,
      fiberG:
        args.fiberG !== undefined
          ? assertRange(args.fiberG, 0, LIMITS.macroGrams, 'Fiber')
          : undefined,
    })
  },
})

export const deleteEntry = mutation({
  args: { foodLogId: v.id('foodLogs') },
  handler: async (ctx, args) => {
    const userId = await requireWriter(ctx)

    const entry = await ctx.db.get(args.foodLogId)
    if (!entry || entry.ownerId !== userId) throw new ConvexError('Entry not found')

    await ctx.db.delete(args.foodLogId)
    if (entry.photoStorageId) await ctx.storage.delete(entry.photoStorageId)
  },
})

// Today's entries (UTC, same bucketing as fitness.ts training-day math) plus
// their sums — what the Caloric Consistency page renders as "today so far".
export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return { entries: [], totals: EMPTY_TOTALS }

    const { start, end } = todayRange(Date.now())
    const entries = await ctx.db
      .query('foodLogs')
      .withIndex('by_owner_loggedAt', (q) =>
        q.eq('ownerId', userId).gte('loggedAt', start).lt('loggedAt', end),
      )
      .collect()
    entries.sort((a, b) => b.loggedAt - a.loggedAt) // newest first

    const totals = entries.reduce(
      (sum, e) => ({
        calories: sum.calories + (e.calories ?? 0),
        proteinG: sum.proteinG + (e.proteinG ?? 0),
        carbsG: sum.carbsG + (e.carbsG ?? 0),
        fatG: sum.fatG + (e.fatG ?? 0),
        fiberG: sum.fiberG + (e.fiberG ?? 0),
      }),
      { ...EMPTY_TOTALS },
    )

    return {
      entries: entries.map((e) => ({
        _id: e._id,
        loggedAt: e.loggedAt,
        source: e.source,
        status: e.status,
        description: e.description ?? null,
        calories: e.calories ?? null,
        proteinG: e.proteinG ?? null,
        carbsG: e.carbsG ?? null,
        fatG: e.fatG ?? null,
        fiberG: e.fiberG ?? null,
      })),
      totals,
    }
  },
})

import { v, ConvexError } from 'convex/values'
import { mutation } from './_generated/server'
import { getOwnedWorkout } from './workouts'
import { cleanText, LIMITS } from './validation'
import { rateLimiter } from './rateLimiter'

// Client and server must agree on valid chip labels — co-located here rather
// than in validation.ts since this list is specific to this one feature.
export const REASON_OPTIONS = [
  'More energy',
  'Better sleep',
  'A workout partner',
  'Clearer plan',
  'More time',
  'Better music/mood',
] as const

export const submit = mutation({
  args: {
    workoutId: v.id('workouts'),
    reasons: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await getOwnedWorkout(ctx, args.workoutId)
    await rateLimiter.limit(ctx, 'workoutFeedbackSubmit', { key: userId, throws: true })

    const existing = await ctx.db
      .query('workoutFeedback')
      .withIndex('by_workout', (q) => q.eq('workoutId', args.workoutId))
      .unique()
    if (existing) throw new ConvexError('Feedback already submitted for this workout')

    const reasons = args.reasons.filter((r) =>
      (REASON_OPTIONS as readonly string[]).includes(r),
    )
    const note = args.note?.trim()
      ? cleanText(args.note, LIMITS.workoutFeedbackNoteMaxLength, 'Note')
      : undefined

    if (reasons.length === 0 && !note) throw new ConvexError('Add a reason or a note')

    await ctx.db.insert('workoutFeedback', { workoutId: args.workoutId, userId, reasons, note })
  },
})

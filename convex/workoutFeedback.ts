import { v, ConvexError } from 'convex/values'
import { mutation } from './_generated/server'
import { getOwnedWorkout } from './workouts'
import { cleanText, LIMITS } from './validation'
import { rateLimiter } from './rateLimiter'
import { REASON_OPTIONS } from './constants'

export const submit = mutation({
  args: {
    workoutId: v.id('workouts'),
    reasons: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, workout } = await getOwnedWorkout(ctx, args.workoutId)
    if (workout.endedAt === undefined) throw new ConvexError('Workout is not finished yet')
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

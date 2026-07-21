import { v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { internalAction, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { cleanText, LIMITS } from './validation'

// This file exports public/internal functions, so it's pulled into the
// frontend's TS program too (via _generated/api) — which has no Node types.
// A local, module-scoped declaration is enough for the one env read below,
// without adding "node" types anywhere they'd leak into other files.
declare const process: { env: Record<string, string | undefined> }

// Single-owner app — this is just the developer's inbox, not a per-tenant setting.
const OWNER_EMAIL = 'otellandanusa@gmail.com'

// Save the suggestion, then fire off an email in the background. Scheduling
// (rather than awaiting the send inline) means a flaky email provider can
// never stop the request itself from being saved.
export const submit = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) throw new Error('Not signed in')

    const text = cleanText(args.text, LIMITS.featureRequestTextMaxLength, 'Feature request')

    const existing = await ctx.db
      .query('featureRequests')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()
    if (existing.length >= LIMITS.featureRequestsPerUser) {
      throw new Error(`Max ${LIMITS.featureRequestsPerUser} feature requests`)
    }

    await ctx.db.insert('featureRequests', { userId, text })

    const [user, profile] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .unique(),
    ])
    const from = profile?.displayName ?? user?.email ?? 'A user'

    await ctx.scheduler.runAfter(0, internal.featureRequests.notifyOwner, { text, from })
  },
})

export const notifyOwner = internalAction({
  args: { text: v.string(), from: v.string() },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('RESEND_API_KEY not set — skipping feature request email')
      return
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Swole <onboarding@resend.dev>',
        to: OWNER_EMAIL,
        subject: 'New Swole feature request',
        text: `${args.from} suggested:\n\n${args.text}`,
      }),
    })

    if (!response.ok) {
      console.error('Resend email failed', response.status, await response.text())
    }
  },
})

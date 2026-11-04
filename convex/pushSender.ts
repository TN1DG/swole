'use node'

import webpush from 'web-push'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { envVar } from './env'
import { isAllowedPushEndpoint, isExpiredPushStatus } from './push'

// How long a push service keeps trying a device that's offline. A day-old "leg
// day at 6?" still tells you someone messaged; anything older is just noise.
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60

export const send = internalAction({
  args: {
    userId: v.id('users'),
    payload: v.object({
      title: v.string(),
      body: v.optional(v.string()),
      url: v.string(),
      tag: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const publicKey = envVar('VAPID_PUBLIC_KEY')
    const privateKey = envVar('VAPID_PRIVATE_KEY')
    const subject = envVar('VAPID_SUBJECT')
    // Not configured on this deployment: nothing to do, and nothing worth failing.
    if (!publicKey || !privateKey || !subject) return

    const subscriptions = await ctx.runQuery(internal.push.subscriptionsFor, {
      userId: args.userId,
    })
    const body = JSON.stringify(args.payload)
    const expired: Id<'pushSubscriptions'>[] = []

    await Promise.all(
      subscriptions.map(async (subscription) => {
        // Checked at send time as well as on subscribe, because this is the line
        // that actually makes the request.
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          expired.push(subscription._id)
          return
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            body,
            {
              TTL: TIME_TO_LIVE_SECONDS,
              urgency: 'high',
              vapidDetails: { subject, publicKey, privateKey },
            },
          )
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (isExpiredPushStatus(status)) {
            expired.push(subscription._id)
          } else {
            // A push is best-effort. One device's failure shouldn't stop the
            // others, and retrying could deliver it late or twice.
            console.warn('Push failed', status)
          }
        }
      }),
    )

    if (expired.length > 0) {
      await ctx.runMutation(internal.push.removeExpired, { ids: expired })
    }
  },
})

import { v, type Value } from 'convex/values'
import type { EmailConfig, GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server'
import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc, DataModel } from './_generated/dataModel'

// Password's `verify`/`reset` options are typed as the abstract, unparametrized
// `EmailConfig` (i.e. `EmailConfig<GenericDataModel>`) regardless of our own
// schema, so that's what these two providers are exported as. Internally we
// still want our concrete `Doc`/`ActionCtx` types for real type-safety —
// see `withCtx` and `defaultAuthorize` below for how that gap gets bridged.
type ActionCtx = GenericActionCtxWithAuthConfig<DataModel>

// This file exports public/internal functions, so it's pulled into the
// frontend's TS program too (via _generated/api) — which has no Node types.
// Same trick as convex/featureRequests.ts.
declare const process: { env: Record<string, string | undefined> }

const OTP_WINDOW_MS = 15 * 60 * 1000
const OTP_MAX_SENDS = 3 // per email, per kind, per window

// Throttles how often we'll actually send an email for a given address+kind,
// regardless of how many times a client asks. Convex Auth's own rate limiter
// (authRateLimits, wired via `maxFailedAttempsPerHour` in convex/auth.ts)
// only throttles *wrong-code guesses* — this is the one it doesn't cover.
export const recordSendAttemptOrThrow = internalMutation({
  args: { email: v.string(), kind: v.union(v.literal('verify'), v.literal('reset')) },
  handler: async (ctx, args) => {
    const key = `${args.kind}:${args.email.toLowerCase()}`
    const now = Date.now()
    const existing = await ctx.db
      .query('emailSendAttempts')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()

    if (!existing || now - existing.windowStart >= OTP_WINDOW_MS) {
      if (existing) {
        await ctx.db.patch(existing._id, { windowStart: now, count: 1 })
      } else {
        await ctx.db.insert('emailSendAttempts', { key, windowStart: now, count: 1 })
      }
      return
    }
    if (existing.count >= OTP_MAX_SENDS) {
      throw new Error('Too many requests — check your inbox or try again in a few minutes.')
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 })
  },
})

// A 6-digit code, typed by hand — short enough to enter without leaving the
// installed PWA (unlike a magic link, which would bounce to a system browser).
function generateOtp(): string {
  const digits = new Uint32Array(6)
  crypto.getRandomValues(digits)
  return Array.from(digits, (n) => String(n % 10)).join('')
}

async function sendOtpEmail(
  ctx: ActionCtx,
  args: { email: string; kind: 'verify' | 'reset'; token: string; subject: string; body: string },
) {
  await ctx.runMutation(internal.emailAuth.recordSendAttemptOrThrow, {
    email: args.email,
    kind: args.kind,
  })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Lets the owner test signup/reset locally without paying for Resend.
    console.warn(`RESEND_API_KEY not set — ${args.kind} code for ${args.email}: ${args.token}`)
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
      to: args.email,
      subject: args.subject,
      text: args.body,
    }),
  })

  if (!response.ok) {
    console.error('Resend email failed', response.status, await response.text())
  }
}

// Built as plain EmailConfig objects (not the `Email()` helper from
// @convex-dev/auth/providers/Email) because that helper only picks up
// `sendVerificationRequest` from its argument — it silently ignores a custom
// `id`, `maxAge`, or `generateVerificationToken`, which would otherwise leave
// us with 1-hour-lived 32-character codes instead of a 6-digit OTP, and both
// providers sharing the id "email" (verify and reset codes would then be
// indistinguishable from each other).
//
// Two spots need a cast to bridge that gap:
// - `sendVerificationRequest` needs `ctx` (to call the throttle mutation
//   above), but Convex Auth's own type for it — inherited as-is from Auth.js —
//   only declares the one `params` argument; the library's own internals hit
//   this exact gap and suppress it with `// @ts-expect-error` at their call
//   site (see @convex-dev/auth/src/server/implementation/signIn.ts).
// - `authorize`'s `account` parameter is typed against the abstract
//   `GenericDataModel`, which has no known fields — casting lets us write it
//   against our real `Doc<'authAccounts'>` instead.
function withCtx(
  fn: (params: { identifier: string; token: string }, ctx: ActionCtx) => Promise<void>,
): EmailConfig['sendVerificationRequest'] {
  return fn as unknown as EmailConfig['sendVerificationRequest']
}

function withAccountDoc(
  fn: (params: Record<string, Value | undefined>, account: Doc<'authAccounts'>) => Promise<void>,
): EmailConfig['authorize'] {
  return fn as unknown as EmailConfig['authorize']
}

const defaultAuthorize = withAccountDoc(async (params, account) => {
  if (typeof params.email !== 'string' || account.providerAccountId !== params.email) {
    throw new Error('Email does not match the account this code was sent to.')
  }
})

export const ResendOTPVerification: EmailConfig = {
  id: 'resend-otp-verification',
  type: 'email',
  name: 'Verification code',
  maxAge: 60 * 15,
  generateVerificationToken: async () => generateOtp(),
  authorize: defaultAuthorize,
  sendVerificationRequest: withCtx(async ({ identifier, token }, ctx) => {
    await sendOtpEmail(ctx, {
      email: identifier,
      kind: 'verify',
      token,
      subject: 'Verify your Swole email',
      body: `Your verification code is ${token}. It expires in 15 minutes.`,
    })
  }),
}

export const ResendOTPPasswordReset: EmailConfig = {
  id: 'resend-otp-reset',
  type: 'email',
  name: 'Password reset code',
  maxAge: 60 * 15,
  generateVerificationToken: async () => generateOtp(),
  authorize: defaultAuthorize,
  sendVerificationRequest: withCtx(async ({ identifier, token }, ctx) => {
    await sendOtpEmail(ctx, {
      email: identifier,
      kind: 'reset',
      token,
      subject: 'Reset your Swole password',
      body: `Your password reset code is ${token}. It expires in 15 minutes. If you didn't request this, ignore this email.`,
    })
  }),
}

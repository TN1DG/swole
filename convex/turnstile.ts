import { v } from 'convex/values'
import { ConvexError } from 'convex/values'
import { action, internalMutation, type MutationCtx } from './_generated/server'
import { internal } from './_generated/api'

/**
 * Cloudflare Turnstile, guarding sign-up.
 *
 * Why this needs two pieces instead of one check inside the sign-up hook:
 * verifying a token means calling Cloudflare, and only a Convex **action** can
 * `fetch`. The hook that has to reject an unverified sign-up
 * (`callbacks.afterUserCreatedOrUpdated` in convex/auth.ts) runs inside the
 * sign-up **mutation**, which cannot. So the action verifies and records a
 * short-lived, single-use pass, and the mutation spends it.
 *
 * What this actually buys: the existing `signUp` limit is a single app-wide
 * bucket, because a Convex action cannot see the caller's IP. That stops a
 * flood, but it also means an attacker can burn the global allowance and lock
 * *everyone* out of registering — a denial of service on sign-up. A challenge
 * moves the cost onto whoever is solving it, which is the only way to tell the
 * two apart without an IP.
 *
 * **Enforcement is on only when `TURNSTILE_SECRET_KEY` is set** on the
 * deployment. Preview and dev deployments are created empty (see
 * scripts/vercel-build.js), and hard-requiring the key would break sign-up on
 * every new branch — a failure mode this project has already shipped once.
 * The trade is that production silently loses the protection if the variable
 * is ever missing, so check it after any deployment change:
 *
 *   npx convex env get TURNSTILE_SECRET_KEY --prod
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Read a Convex deployment environment variable.
 *
 * Reached through `globalThis` rather than the bare `process` global on
 * purpose. This module exports a *public* action, which puts it in the `api`
 * type surface that `src` imports — so it gets type-checked by
 * tsconfig.app.json, whose `types` is `["vite/client"]` with no node types.
 * (convex/emailAuth.ts uses `process.env` directly and is fine precisely
 * because it only exports internal functions and never enters that graph.)
 */
function envVar(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ]
}

// Long enough to finish typing a password and hit submit; short enough that a
// solved challenge is worthless to bank in bulk.
const CHALLENGE_TTL_MS = 10 * 60 * 1000

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Verify a Turnstile token with Cloudflare and, if it's good, record a pass
 * that `spendSignupChallenge` can consume during sign-up.
 *
 * Public because the client calls it before signing up. It reveals nothing: it
 * either accepts a token or doesn't.
 */
export const verifySignupChallenge = action({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, args): Promise<{ required: boolean }> => {
    const secret = envVar('TURNSTILE_SECRET_KEY')
    if (!secret) {
      // Not configured on this deployment — sign-up proceeds unguarded. See
      // the note at the top of this file.
      return { required: false }
    }

    const body = new URLSearchParams({ secret, response: args.token })
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    // A non-200 from Cloudflare is an outage on their side, not a failed
    // challenge. Fail closed: letting sign-ups through unverified whenever
    // Cloudflare hiccups would make the protection trivial to bypass by
    // waiting for one.
    if (!response.ok) {
      throw new ConvexError('Could not check the challenge just now — please try again.')
    }

    const result = (await response.json()) as { success?: boolean }
    if (result.success !== true) {
      throw new ConvexError('Challenge failed — please try again.')
    }

    await ctx.runMutation(internal.turnstile.recordSignupChallenge, {
      email: normalizeEmail(args.email),
    })
    return { required: true }
  },
})

/** Records a solved challenge. Internal: only `verifySignupChallenge` may call it. */
export const recordSignupChallenge = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // One outstanding pass per email — re-solving replaces rather than stacks,
    // so a client that retries can't accumulate a pile of spendable passes.
    const existing = await ctx.db
      .query('signupChallenges')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .collect()
    for (const row of existing) await ctx.db.delete(row._id)

    await ctx.db.insert('signupChallenges', {
      email: args.email,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    })
  },
})

/**
 * Spend the pass for this email, throwing if there isn't a valid one.
 *
 * Called from the sign-up mutation, so a throw rolls the whole sign-up back and
 * no half-created account survives.
 *
 * Note what that means for the delete below: on the *expired* path the throw
 * rolls the delete back too, so the stale row survives. A Convex mutation is
 * all-or-nothing — you cannot both delete a row and reject the transaction that
 * deleted it. That's fine here, and the alternative would be worse:
 *
 *   - it stays expired, so it can never authorise anything;
 *   - `recordSignupChallenge` clears existing rows for the email before
 *     inserting, so solving a new challenge replaces it rather than stacking;
 *   - the successful path doesn't throw, so there the delete really does
 *     commit, which is what makes a pass single-use.
 *
 * The only residue is one dead row per email that started sign-up and never
 * finished. A test pins this, so nobody "fixes" it back into a claim the
 * transaction model cannot honour.
 */
export async function spendSignupChallenge(ctx: MutationCtx, rawEmail: string): Promise<void> {
  if (!envVar('TURNSTILE_SECRET_KEY')) return

  const email = normalizeEmail(rawEmail)
  const pass = await ctx.db
    .query('signupChallenges')
    .withIndex('by_email', (q) => q.eq('email', email))
    .first()

  if (!pass) {
    throw new ConvexError('Please complete the challenge before signing up.')
  }
  await ctx.db.delete(pass._id)
  if (pass.expiresAt < Date.now()) {
    throw new ConvexError('That challenge expired — please try again.')
  }
}

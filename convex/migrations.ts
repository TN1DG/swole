import { internalMutation } from './_generated/server'

// One-off, run manually before deploying email verification to a deployment
// that already has real accounts:
//   npx convex run migrations:backfillEmailVerified [--prod]
//
// Without this, any existing account (the owner's own dev account, any
// friends already testing) would be forced through "enter your code" on its
// very next sign-in the moment `verify` is turned on in convex/auth.ts —
// Password.js checks `if (config.verify && !account.emailVerified)` on every
// sign-in, not just sign-up.
export const backfillEmailVerified = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query('authAccounts').collect()
    let patched = 0
    for (const account of accounts) {
      if (account.provider === 'password' && !account.emailVerified) {
        await ctx.db.patch(account._id, { emailVerified: account.providerAccountId })
        patched++
      }
    }
    return { patched, total: accounts.length }
  },
})

// One-off, paired with the above: marks any profile that already has both a
// username and a display name as "onboarded", so an existing tester isn't
// shown the new welcome carousel for a profile they already set up.
//   npx convex run migrations:backfillOnboarded [--prod]
export const backfillOnboarded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query('profiles').collect()
    let patched = 0
    for (const profile of profiles) {
      if (profile.username && profile.displayName && !profile.onboardedAt) {
        await ctx.db.patch(profile._id, { onboardedAt: Date.now() })
        patched++
      }
    }
    return { patched, total: profiles.length }
  },
})

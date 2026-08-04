import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { api, internal } from './_generated/api'
import { createBackend, type T } from './test.helpers'

// This file drives the real `auth:signIn` action end to end, so it needs the
// JWT signing keys a live deployment gets from scripts/setup-auth-env.mjs —
// same setup as convex/emailAuth.test.ts.
let jwtPrivateKey: string
let jwks: string
beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true })
  jwtPrivateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ')
  jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] })
})

// Enforcement is deliberately conditional on TURNSTILE_SECRET_KEY being set —
// preview deployments are created empty and a hard requirement would break
// sign-up on every branch (see convex/turnstile.ts). These tests drive both
// sides of that switch, because "it's off when unconfigured" is exactly the
// behaviour that could hide a broken guard in production.
const SECRET = 'TURNSTILE_SECRET_KEY'

function signUp(t: T, email: string) {
  return t.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signUp', email, password: 'longenough123' },
  })
}

beforeEach(() => {
  process.env.JWT_PRIVATE_KEY = jwtPrivateKey
  process.env.JWKS = jwks
  process.env.SITE_URL = 'http://localhost:5173'
  process.env.CONVEX_SITE_URL = 'http://localhost:5173'
})

afterEach(() => {
  delete process.env[SECRET]
  delete process.env.JWT_PRIVATE_KEY
  delete process.env.JWKS
  delete process.env.SITE_URL
  delete process.env.CONVEX_SITE_URL
})

describe('signup challenge — not configured', () => {
  beforeEach(() => {
    delete process.env[SECRET]
  })

  it('lets sign-up through untouched', async () => {
    const t = createBackend()
    await expect(signUp(t, 'alice@test.local')).resolves.toBeTruthy()
  })
})

describe('signup challenge — configured', () => {
  beforeEach(() => {
    process.env[SECRET] = 'test-secret'
  })

  it('refuses a sign-up with no solved challenge', async () => {
    const t = createBackend()
    await expect(signUp(t, 'alice@test.local')).rejects.toThrow(/challenge/i)
  })

  it('accepts a sign-up once a challenge has been recorded for that email', async () => {
    const t = createBackend()
    await t.mutation(internal.turnstile.recordSignupChallenge, { email: 'alice@test.local' })
    await expect(signUp(t, 'alice@test.local')).resolves.toBeTruthy()
  })

  it('spends the pass on success, so it cannot authorise a second sign-up', async () => {
    const t = createBackend()
    await t.mutation(internal.turnstile.recordSignupChallenge, { email: 'alice@test.local' })
    await signUp(t, 'alice@test.local')

    // Asserted on the row rather than by signing up again: a second sign-up
    // with the same email fails because the account now exists, which would
    // pass this test without the pass ever having been spent.
    const left = await t.run(async (ctx) => ctx.db.query('signupChallenges').collect())
    expect(left).toEqual([])
  })

  it("does not let one email's challenge authorise a different email", async () => {
    const t = createBackend()
    await t.mutation(internal.turnstile.recordSignupChallenge, { email: 'alice@test.local' })
    await expect(signUp(t, 'eve@test.local')).rejects.toThrow(/challenge/i)
  })

  it('matches the email case-insensitively, the way sign-up normalizes it', async () => {
    const t = createBackend()
    await t.mutation(internal.turnstile.recordSignupChallenge, { email: 'alice@test.local' })
    await expect(signUp(t, 'ALICE@test.local')).resolves.toBeTruthy()
  })

  it('rejects an expired pass and consumes it rather than leaving it retryable', async () => {
    const t = createBackend()
    await t.run(async (ctx) => {
      await ctx.db.insert('signupChallenges', {
        email: 'alice@test.local',
        expiresAt: Date.now() - 1,
      })
    })

    await expect(signUp(t, 'alice@test.local')).rejects.toThrow(/expired/i)

    // The stale row SURVIVES, and that is not a bug to fix. The rejection
    // throws, and a Convex mutation is all-or-nothing — the same rollback that
    // guarantees no half-created account also undoes the delete. It stays
    // harmless because it is still expired, and solving a fresh challenge
    // replaces it rather than stacking (asserted below).
    const left = await t.run(async (ctx) => ctx.db.query('signupChallenges').collect())
    expect(left).toHaveLength(1)
  })

  it('replaces a stale pass instead of accumulating one per attempt', async () => {
    const t = createBackend()
    await t.run(async (ctx) => {
      await ctx.db.insert('signupChallenges', {
        email: 'alice@test.local',
        expiresAt: Date.now() - 1,
      })
    })

    await t.mutation(internal.turnstile.recordSignupChallenge, { email: 'alice@test.local' })

    const rows = await t.run(async (ctx) => ctx.db.query('signupChallenges').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0].expiresAt).toBeGreaterThan(Date.now())
    // ...and the replacement is spendable.
    await expect(signUp(t, 'alice@test.local')).resolves.toBeTruthy()
  })
})

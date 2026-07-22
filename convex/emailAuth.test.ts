import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose'
import { api } from './_generated/api'
import { createBackend } from './test.helpers'

// Unlike every other test file, this one exercises the *real* `auth:signIn`
// action end to end (not just mutations gated by a mocked identity), so it
// needs the same JWT signing keys a real deployment gets from
// scripts/setup-auth-env.mjs — generated once here instead, since these
// never need to be stable across runs.
let jwtPrivateKey: string
let jwks: string
beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true })
  jwtPrivateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, ' ')
  jwks = JSON.stringify({ keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }] })
})

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The email body is plain text: "Your verification code is 123456. ..." or
// "Your password reset code is 123456. ...". Codes are stored hashed at rest
// (convex/emailAuth.ts never persists them in the clear), so tests recover
// the code the same way a real inbox would: from the sent message body.
function extractCode(fetchMock: ReturnType<typeof mockFetchOk>): string {
  const call = fetchMock.mock.calls.at(-1)!
  const body = JSON.parse(call[1].body)
  const match = /code is (\d{6})/.exec(body.text)
  if (!match) throw new Error(`No code found in email body: ${body.text}`)
  return match[1]
}

beforeEach(() => {
  vi.useFakeTimers()
  // Only set on real deployments via scripts/setup-auth-env.mjs; the auth
  // library needs it to build the verification-code URL even though our
  // OTP flow never uses that URL (see convex/emailAuth.ts).
  process.env.SITE_URL = 'http://localhost:5173'
  process.env.CONVEX_SITE_URL = 'http://localhost:5173'
  process.env.RESEND_API_KEY = 'test-key'
  process.env.JWT_PRIVATE_KEY = jwtPrivateKey
  process.env.JWKS = jwks
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.RESEND_API_KEY
  delete process.env.SITE_URL
  delete process.env.CONVEX_SITE_URL
  delete process.env.JWT_PRIVATE_KEY
  delete process.env.JWKS
})

describe('sign up + email verification', () => {
  it('sends a code on sign-up, then verifies and signs in', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()

    // Password wraps verify/reset internally (signInViaProvider), so the
    // library's "started" signal never reaches this top-level action for the
    // password provider — a pending code shows up as `tokens: null` instead,
    // same shape a client sees for `signingIn: false`.
    const started = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'alice@test.local', password: 'longenough123' },
    })
    expect(started.tokens ?? null).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(init.body)
    expect(body.to).toBe('alice@test.local')
    expect(body.subject).toMatch(/verify/i)

    const code = extractCode(fetchMock)
    const result = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'email-verification', email: 'alice@test.local', code },
    })
    expect(result.tokens).toBeTruthy()

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q.eq('provider', 'password').eq('providerAccountId', 'alice@test.local'),
        )
        .unique()
      expect(account?.emailVerified).toBeTruthy()
    })
  })

  it('rejects a wrong code', async () => {
    mockFetchOk()
    const t = createBackend()

    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'bob@test.local', password: 'longenough123' },
    })

    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'email-verification', email: 'bob@test.local', code: '000000' },
      }),
    ).rejects.toThrow(/could not verify code/i)
  })

  it('an already-verified account signs in directly, without a new code', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()

    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'carol@test.local', password: 'longenough123' },
    })
    const code = extractCode(fetchMock)
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'email-verification', email: 'carol@test.local', code },
    })

    fetchMock.mockClear()
    const result = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'carol@test.local', password: 'longenough123' },
    })
    expect(result.tokens).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throttles repeated verification-code requests for the same email', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()

    // Sign-up itself sends the 1st code; each of these re-triggers one more.
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'dave@test.local', password: 'longenough123' },
    })
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'dave@test.local', password: 'longenough123' },
    })
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'dave@test.local', password: 'longenough123' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // 4th send within the 15-minute window is throttled.
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email: 'dave@test.local', password: 'longenough123' },
      }),
    ).rejects.toThrow(/too many/i)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('password reset', () => {
  it('requests a reset code, verifies it, and signs in with the new password', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()

    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'erin@test.local', password: 'originalpass1' },
    })
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: {
        flow: 'email-verification',
        email: 'erin@test.local',
        code: extractCode(fetchMock),
      },
    })

    // Capture the pre-reset session so we can confirm it gets invalidated.
    const sessionsBefore = await t.run(async (ctx) => {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q.eq('provider', 'password').eq('providerAccountId', 'erin@test.local'),
        )
        .unique()
      return ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', account!.userId))
        .collect()
    })
    expect(sessionsBefore.length).toBe(1)

    fetchMock.mockClear()
    const started = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'reset', email: 'erin@test.local' },
    })
    expect(started.tokens ?? null).toBeNull()
    const resetBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(resetBody.subject).toMatch(/reset/i)

    const result = await t.action(api.auth.signIn, {
      provider: 'password',
      params: {
        flow: 'reset-verification',
        email: 'erin@test.local',
        code: extractCode(fetchMock),
        newPassword: 'brandnewpass1',
      },
    })
    expect(result.tokens).toBeTruthy()

    // Old password no longer works, new one does.
    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: { flow: 'signIn', email: 'erin@test.local', password: 'originalpass1' },
      }),
    ).rejects.toThrow()
    const signedInAgain = await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signIn', email: 'erin@test.local', password: 'brandnewpass1' },
    })
    expect(signedInAgain.tokens).toBeTruthy()

    // The session that existed before the reset was invalidated.
    const sessionsAfter = await t.run(async (ctx) => {
      const account = await ctx.db
        .query('authAccounts')
        .withIndex('providerAndAccountId', (q) =>
          q.eq('provider', 'password').eq('providerAccountId', 'erin@test.local'),
        )
        .unique()
      return ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', account!.userId))
        .collect()
    })
    expect(sessionsAfter.some((s) => s._id === sessionsBefore[0]._id)).toBe(false)
  })

  it('rejects a wrong reset code', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()

    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'signUp', email: 'frank@test.local', password: 'originalpass1' },
    })
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: {
        flow: 'email-verification',
        email: 'frank@test.local',
        code: extractCode(fetchMock),
      },
    })
    await t.action(api.auth.signIn, {
      provider: 'password',
      params: { flow: 'reset', email: 'frank@test.local' },
    })

    await expect(
      t.action(api.auth.signIn, {
        provider: 'password',
        params: {
          flow: 'reset-verification',
          email: 'frank@test.local',
          code: '000000',
          newPassword: 'brandnewpass1',
        },
      }),
    ).rejects.toThrow(/could not verify code/i)
  })
})

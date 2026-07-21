import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { asUser, createBackend, createUser, type T } from './test.helpers'

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.RESEND_API_KEY
})

describe('submit', () => {
  it('saves the request and schedules an email to the owner', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    const fetchMock = mockFetchOk()
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await user.mutation(api.featureRequests.submit, { text: 'Add a rest timer please' })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toMatch(/^Bearer /)
    const body = JSON.parse(init.body)
    expect(body.to).toBe('otellandanusa@gmail.com')
    expect(body.text).toContain('Add a rest timer please')
  })

  it('rejects empty or overly long text', async () => {
    mockFetchOk()
    const t = createBackend()
    const user = asUser(t, await createUser(t, 'alice'))

    await expect(user.mutation(api.featureRequests.submit, { text: '   ' })).rejects.toThrow(
      /required/i,
    )
    await expect(
      user.mutation(api.featureRequests.submit, { text: 'x'.repeat(1001) }),
    ).rejects.toThrow(/too long/i)
  })

  it('enforces the per-user cap', async () => {
    mockFetchOk()
    const t = createBackend()
    const userId = await createUser(t, 'alice')
    const user = asUser(t, userId)

    await t.run(async (ctx) => {
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert('featureRequests', { userId, text: `request ${i}` })
      }
    })

    await expect(
      user.mutation(api.featureRequests.submit, { text: 'one more' }),
    ).rejects.toThrow(/max 20/i)
  })

  it('requires sign-in', async () => {
    mockFetchOk()
    const t: T = createBackend()
    await expect(
      t.mutation(api.featureRequests.submit, { text: 'hello' }),
    ).rejects.toThrow(/not signed in/i)
  })
})

describe('notifyOwner', () => {
  it('skips sending (without throwing) when RESEND_API_KEY is unset', async () => {
    const fetchMock = mockFetchOk()
    const t = createBackend()
    await t.action(internal.featureRequests.notifyOwner, { text: 'hi', from: 'Bob' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

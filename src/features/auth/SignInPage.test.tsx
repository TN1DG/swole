import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHALLENGE_REQUIRED_MESSAGE } from '../../../convex/constants'
import { STALE_SHELL_MESSAGE } from '../../lib/turnstile'

// The auth SDK and the Convex client are the two things this page cannot run
// without and has no business exercising in a unit test — one opens a
// websocket, the other calls Cloudflare. Everything else (MUI, the form, the
// error branching) is the real thing.
const signIn = vi.fn()
const verifyChallenge = vi.fn()
const updateServiceWorker = vi.fn(() => Promise.resolve())

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn }),
}))
vi.mock('convex/react', () => ({
  useAction: () => verifyChallenge,
}))
vi.mock('../../lib/serviceWorker', () => ({
  updateServiceWorker: () => updateServiceWorker(),
}))

// VITE_TURNSTILE_SITE_KEY is unset under test, so `turnstileEnabled` is false —
// which is exactly the stale-bundle condition these tests care about.
const { SignInPage } = await import('./SignInPage')

async function submitSignUp() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: "Don't have an account? Sign up" }))
  await user.type(screen.getByPlaceholderText('Email'), 'someone@example.com')
  await user.type(screen.getByPlaceholderText('Password (min. 8 characters)'), 'hunter2hunter2')
  await user.click(screen.getByRole('button', { name: 'Sign Up' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignInPage sign-in', () => {
  it('does not name a cause it has not verified when sign-in fails', async () => {
    signIn.mockRejectedValueOnce(new Error('boom'))
    render(<SignInPage />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Email'), 'someone@example.com')
    await user.type(screen.getByPlaceholderText('Password (min. 8 characters)'), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByText(/Wrong email or password/)).toBeInTheDocument()
  })
})

// The dead end this branch exists for: a bundle cached from before Turnstile
// was switched on has no widget, so the server's "complete the challenge" is
// advice the page cannot offer. See issue #19.
describe('SignInPage stale shell', () => {
  it('tells an out-of-date page to refresh, and pulls the new worker in', async () => {
    signIn.mockRejectedValueOnce(new ConvexError(CHALLENGE_REQUIRED_MESSAGE))
    render(<SignInPage />)
    await submitSignUp()

    expect(await screen.findByText(STALE_SHELL_MESSAGE)).toBeInTheDocument()
    // Without this the refresh we just asked for would serve the same cached
    // bundle straight back.
    expect(updateServiceWorker).toHaveBeenCalled()
  })

  it('passes other sign-up failures through untouched', async () => {
    signIn.mockRejectedValueOnce(new ConvexError('That challenge expired — please try again.'))
    render(<SignInPage />)
    await submitSignUp()

    expect(await screen.findByText('That challenge expired — please try again.')).toBeInTheDocument()
    expect(screen.queryByText(STALE_SHELL_MESSAGE)).not.toBeInTheDocument()
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })

  it('falls back to generic advice for a non-Convex error', async () => {
    signIn.mockRejectedValueOnce(new Error('network down'))
    render(<SignInPage />)
    await submitSignUp()

    expect(await screen.findByText(/Could not create the account/)).toBeInTheDocument()
    expect(screen.queryByText(STALE_SHELL_MESSAGE)).not.toBeInTheDocument()
  })

  // turnstileEnabled is false here, so the page must not try to verify a token
  // it was never able to collect — that call would fail for a second reason
  // and mask the first.
  it('does not attempt challenge verification when this bundle has no widget', async () => {
    signIn.mockResolvedValueOnce(undefined)
    render(<SignInPage />)
    await submitSignUp()

    expect(verifyChallenge).not.toHaveBeenCalled()
    expect(signIn).toHaveBeenCalled()
  })
})

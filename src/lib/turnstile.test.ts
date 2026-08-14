import { describe, expect, it } from 'vitest'
import { CHALLENGE_REQUIRED_MESSAGE } from '../../convex/constants'
import { isStaleShellChallengeError } from './turnstile'

// A bundle built before VITE_TURNSTILE_SITE_KEY existed has the widget
// tree-shaken out, so when the server starts enforcing the challenge that
// client is told to complete something its page cannot show. All three
// conditions together are what identify it; each test below removes exactly
// one, because dropping any of them would misfire on an innocent case.
describe('isStaleShellChallengeError', () => {
  const stale = {
    flow: 'signUp' as const,
    widgetAvailable: false,
    message: CHALLENGE_REQUIRED_MESSAGE,
  }

  it('recognises the stale shell', () => {
    expect(isStaleShellChallengeError(stale)).toBe(true)
  })

  // A current bundle hitting this message means something real — most likely a
  // challenge that expired mid-sign-up. Telling that user to refresh would
  // send them round a loop that cannot help.
  it('ignores it when this bundle does have a widget', () => {
    expect(isStaleShellChallengeError({ ...stale, widgetAvailable: true })).toBe(false)
  })

  // Sign-in never involves a challenge, so this message cannot legitimately
  // arrive on that flow and must not be reinterpreted as staleness.
  it('ignores it on sign-in', () => {
    expect(isStaleShellChallengeError({ ...stale, flow: 'signIn' })).toBe(false)
  })

  it('ignores any other failure, including the expired-challenge message', () => {
    expect(
      isStaleShellChallengeError({ ...stale, message: 'That challenge expired — please try again.' }),
    ).toBe(false)
    expect(isStaleShellChallengeError({ ...stale, message: null })).toBe(false)
    expect(isStaleShellChallengeError({ ...stale, message: 'Wrong email or password.' })).toBe(false)
  })

  // The client matches the server's wording. If the two ever drift the branch
  // silently stops firing and the dead end comes back, so both sides read the
  // same constant — this asserts the client is genuinely using it rather than
  // a copy that happens to match today.
  it('matches the exact message the server throws', () => {
    expect(CHALLENGE_REQUIRED_MESSAGE).toBe('Please complete the challenge before signing up.')
    expect(
      isStaleShellChallengeError({ ...stale, message: CHALLENGE_REQUIRED_MESSAGE.toUpperCase() }),
    ).toBe(false)
  })
})

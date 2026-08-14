/**
 * Client-side Turnstile configuration.
 *
 * Separate from the widget component so that file exports only a component —
 * mixing constants in breaks React Fast Refresh, which the linter enforces.
 *
 * The site key is public by design (it identifies the widget to Cloudflare);
 * the secret key lives only on the Convex deployment. When this is unset the
 * whole challenge is off, matching the server, which skips enforcement unless
 * TURNSTILE_SECRET_KEY is set. See convex/turnstile.ts for why both ends are
 * gated rather than hard-required.
 */
import { CHALLENGE_REQUIRED_MESSAGE } from '../../convex/constants'

export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY

/** Whether a challenge is expected. Callers use this to decide if a token is required. */
export const turnstileEnabled: boolean = Boolean(TURNSTILE_SITE_KEY)

/** What to tell someone whose page predates the challenge. */
export const STALE_SHELL_MESSAGE = 'This page is out of date. Please refresh and try again.'

/**
 * Recognises the one situation where the server demands a challenge that this
 * page cannot possibly show: a service-worker-cached bundle built before
 * `VITE_TURNSTILE_SITE_KEY` existed.
 *
 * The site key is inlined at build time, so an old bundle has
 * `turnstileEnabled === false` and the widget is tree-shaken out entirely. If
 * the server meanwhile *does* have its secret set, sign-up is rejected with
 * `CHALLENGE_REQUIRED_MESSAGE` — advice that is correct for a current client
 * and impossible to follow on a stale one, with no challenge on the page.
 *
 * All three conditions together are what make this unambiguous. Any one of
 * them alone has innocent explanations: a current bundle can legitimately see
 * this error when a challenge expired mid-sign-up, and sign-*in* never
 * involves a challenge at all.
 *
 * Kept here, pure and free of React, so the branch can be tested directly —
 * this repo has no component test environment yet (issue #30).
 */
export function isStaleShellChallengeError(args: {
  flow: 'signIn' | 'signUp'
  /** This bundle's own `turnstileEnabled`. */
  widgetAvailable: boolean
  message: string | null
}): boolean {
  return (
    args.flow === 'signUp' && !args.widgetAvailable && args.message === CHALLENGE_REQUIRED_MESSAGE
  )
}

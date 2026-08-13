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
export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY

/** Whether a challenge is expected. Callers use this to decide if a token is required. */
export const turnstileEnabled: boolean = Boolean(TURNSTILE_SITE_KEY)

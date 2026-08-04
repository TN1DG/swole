import { useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

/**
 * Cloudflare Turnstile challenge widget.
 *
 * Renders nothing at all unless `VITE_TURNSTILE_SITE_KEY` is set. Preview and
 * dev builds don't have it, and a hard requirement would break sign-up on
 * every branch — the server side is gated the same way (see
 * convex/turnstile.ts), so the two stay consistent: no key means no challenge
 * on either end, rather than a widget that can never be satisfied.
 *
 * Loaded explicitly rather than with Turnstile's auto-render so React owns the
 * DOM node. Auto-render scans the document and would fight the component
 * lifecycle when the sign-in form toggles between its sign-in and sign-up steps.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

// One <script> per document, shared by every mount. Re-adding it would reset
// any widget already on screen.
function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')))
      if (window.turnstile) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Turnstile failed to load'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function TurnstileWidget({
  onToken,
}: {
  /** Called with a fresh token, and with null whenever the old one stops being valid. */
  onToken: (token: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Kept in a ref so the effect below doesn't re-run (and re-render the
  // widget) every time the parent re-renders with a new callback identity.
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    // Captured into a local so it stays narrowed to `string` inside the async
    // callback below — a module-level const isn't narrowed across a closure.
    const siteKey = TURNSTILE_SITE_KEY
    if (!siteKey) return
    let widgetId: string | null = null
    let cancelled = false

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          // A token is single-use and expires. Clearing it means the form asks
          // for a fresh challenge rather than submitting one the server will
          // reject.
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          theme: 'auto',
        })
      })
      .catch(() => {
        // Network blocked or Cloudflare unreachable. Leave the token null —
        // the form reports that the challenge is required rather than
        // submitting something the server will refuse.
        onTokenRef.current(null)
      })

    return () => {
      cancelled = true
      if (widgetId !== null) window.turnstile?.remove(widgetId)
    }
  }, [])

  if (!TURNSTILE_SITE_KEY) return null
  return <Box ref={containerRef} sx={{ display: 'flex', justifyContent: 'center', mt: 1 }} />
}

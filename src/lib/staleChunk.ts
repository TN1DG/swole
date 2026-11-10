/**
 * A page left open across a deploy (or served an old shell by the service
 * worker) still runs the previous bundle, whose lazy chunks no longer exist on
 * the server. Opening a route then fails to import its code: the server's SPA
 * fallback answers the missing .js with index.html, and the browser rejects it.
 * Each browser words that differently.
 */
const STALE_CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module', // Chrome, Edge
  'Importing a module script failed', // Safari
  'error loading dynamically imported module', // Firefox
  'Unable to preload CSS', // Vite's CSS preload
  'is not a valid JavaScript MIME type', // a chunk answered with index.html
]

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return STALE_CHUNK_MESSAGES.some((m) => message.toLowerCase().includes(m.toLowerCase()))
}

const RELOAD_KEY = 'swole:staleChunkReloadAt'
/** Long enough to cover a reload; any second failure inside it is a real bug. */
export const RELOAD_GUARD_MS = 30_000

/**
 * Whether a reload may be tried now, and if so, records that it was. One
 * reload per window: if the fresh page fails the same way, the deploy itself
 * is broken and reloading forever would hide that behind a flicker loop.
 */
export function claimReload(storage: Pick<Storage, 'getItem' | 'setItem'>, now = Date.now()): boolean {
  try {
    const stored = storage.getItem(RELOAD_KEY)
    const last = stored === null ? NaN : Number(stored)
    if (Number.isFinite(last) && now - last < RELOAD_GUARD_MS) return false
    storage.setItem(RELOAD_KEY, String(now))
    return true
  } catch {
    // Storage blocked (private mode, quota): no way to guard, so don't loop.
    return false
  }
}

/**
 * Asks for the newest service worker and, if one is on its way, waits (up to
 * `ms`) for it to take over the page. It skips waiting (src/sw.ts), so this
 * is normally a moment. Without it the reload could be answered with the same
 * stale shell and fail all over again. Best effort: any failure just reloads.
 */
async function adoptNewServiceWorker(ms: number): Promise<void> {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  if (!sw) return
  try {
    const registration = await sw.getRegistration()
    if (!registration) return
    await registration.update()
    if (!registration.installing && !registration.waiting) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      sw.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
  } catch {
    // Reload regardless.
  }
}

/**
 * Reloads onto the current deploy. Returns false, without reloading, when a
 * reload was already tried moments ago; the caller then shows its error UI.
 */
export async function reloadForStaleChunk(): Promise<boolean> {
  if (!claimReload(window.sessionStorage)) return false
  await adoptNewServiceWorker(5000)
  window.location.reload()
  return true
}

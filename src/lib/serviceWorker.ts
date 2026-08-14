/**
 * Ask the browser to check for a newer service worker right now.
 *
 * `registerType: 'autoUpdate'` (vite.config.ts) picks up a new worker on the
 * *next* navigation, which is too late for a page that has already hit a
 * version disagreement with the server. Calling this first means the refresh
 * we're about to tell the user to do lands on the current shell instead of
 * serving the same stale bundle back to them.
 *
 * Best effort by design: it is called on a path that already ends in "please
 * refresh", and that advice holds whether or not this succeeds. Failing here
 * must never replace a useful message with a service-worker error.
 */
export async function updateServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  } catch {
    // Ignored — see above.
  }
}

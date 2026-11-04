/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { PHOTO_CACHE_NAME } from './lib/photoCache'
import { planNotification, safeAppPath } from './pushPayload'

declare const self: ServiceWorkerGlobalScope

// ---------- the app shell: same behaviour as the generateSW worker this replaced ----------

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// registerType: 'autoUpdate' relies on these: a new worker takes over at once
// rather than waiting for every tab to close. See src/lib/serviceWorker.ts.
self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ---------- photos ----------

// Each stored photo has a stable URL and never changes, so a copy on the device is
// always right: seen once, it loads instantly and costs no data again.
//
// mode: 'cors' is what makes this safe. A plain <img> request would give an opaque
// response, which browsers count against storage at many times its real size, and
// which can't be told apart from an error. Convex storage allows CORS.
registerRoute(
  ({ url, request }) =>
    request.destination === 'image' &&
    url.pathname.startsWith('/api/storage/') &&
    (url.hostname.endsWith('.convex.cloud') || url.hostname === '127.0.0.1'),
  new CacheFirst({
    cacheName: PHOTO_CACHE_NAME,
    fetchOptions: { mode: 'cors', credentials: 'omit' },
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// ---------- push ----------

self.addEventListener('push', (event) => {
  const plan = planNotification(event.data?.text())
  event.waitUntil(self.registration.showNotification(plan.title, plan.options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safeAppPath((event.notification.data as { url?: unknown } | null)?.url)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) {
        // Navigate can be refused for a window this worker doesn't control yet,
        // and landing on the app at all still beats doing nothing.
        await open.navigate(path).catch(() => null)
        await open.focus()
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})

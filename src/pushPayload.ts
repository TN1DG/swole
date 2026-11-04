// What the service worker does with a push, as plain functions it and its tests
// can share. Deliberately free of any browser or worker API.

export type NotificationPlan = {
  title: string
  options: {
    body?: string
    tag?: string
    renotify?: boolean
    icon: string
    badge: string
    data: { url: string }
  }
}

// Only ever a path inside this app. A push payload comes from our own server, but
// this decides where a tap opens, so it isn't the place to trust anything.
export function safeAppPath(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/'
  // Browsers treat a backslash as a slash in URLs, so "/\evil.com" is off-site too.
  if (url.includes('\\')) return '/'
  return url
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

// Always produces something to show, even from a payload it can't read. Browsers
// expect every push to display a notification, and Safari can revoke the
// subscription of an app that keeps not doing so.
export function planNotification(raw: string | null | undefined): NotificationPlan {
  let payload: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}')
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>
  } catch {
    // Falls through to the generic notification below.
  }

  const tag = text(payload.tag)
  const body = text(payload.body)
  return {
    title: text(payload.title) ?? 'Swole',
    options: {
      ...(body && { body }),
      // renotify buzzes again for a new message replacing one under the same tag;
      // browsers reject the option outright when there's no tag.
      ...(tag && { tag, renotify: true }),
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      data: { url: safeAppPath(payload.url) },
    },
  }
}

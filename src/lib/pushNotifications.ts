// The browser's side of push: what this device supports, and asking it for a
// subscription. Saving that to the account is the caller's job.

export type PushSupport =
  | 'supported'
  // iPhone and iPad only allow push from an app added to the Home Screen.
  | 'needs-install'
  | 'unsupported'

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function isInstalled(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupport(): PushSupport {
  if (typeof navigator === 'undefined') return 'unsupported'
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis && (!isIos() || isInstalled())) return 'supported'
  return isIos() && !isInstalled() ? 'needs-install' : 'unsupported'
}

export function pushPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'default'
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// getRegistration rather than `ready`, which waits forever where no worker exists,
// such as the dev server.
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  return await navigator.serviceWorker.getRegistration()
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  return (await (await registration())?.pushManager.getSubscription()) ?? null
}

export type SubscriptionKeys = { endpoint: string; p256dh: string; auth: string }

export function subscriptionKeys(subscription: PushSubscription): SubscriptionKeys | null {
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) return null
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

// Must run from a tap: browsers refuse or silently ignore a permission prompt that
// isn't. Throws with a message written for the person holding the phone.
export async function requestPushSubscription(publicKey: string): Promise<SubscriptionKeys> {
  const worker = await registration()
  if (!worker) throw new Error('Notifications need the installed app. Try reloading.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. You can allow them in your browser settings.')
  }

  let subscription: PushSubscription
  try {
    subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    })
  } catch {
    // Most often Brave, which ships with Google's push service switched off.
    throw new Error(
      "This browser couldn't reach its push service. In Brave, turn on \"Use Google services for push messaging\" in Settings → Privacy and security.",
    )
  }

  const keys = subscriptionKeys(subscription)
  if (!keys) throw new Error('Could not turn on notifications.')
  return keys
}

// Returns the endpoint it removed, so the caller can remove it from the account.
export async function removePushSubscription(): Promise<string | null> {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe()
  return endpoint
}

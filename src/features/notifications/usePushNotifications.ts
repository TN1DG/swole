import { useCallback, useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  currentSubscription,
  pushPermission,
  pushSupport,
  removePushSubscription,
  requestPushSubscription,
} from '../../lib/pushNotifications'
import { clearPhotoCache } from '../../lib/photoCache'
import { errorMessage } from '../../lib/errors'

export function usePushNotifications(publicKey: string | null | undefined) {
  const saveSubscription = useMutation(api.push.subscribe)
  const dropSubscription = useMutation(api.push.unsubscribe)
  const support = pushSupport()

  // undefined until the browser has answered.
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void currentSubscription().then((subscription) => {
      if (!cancelled) setEnabled(subscription !== null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    if (!publicKey) return
    setError(null)
    setBusy(true)
    try {
      await saveSubscription(await requestPushSubscription(publicKey))
      setEnabled(true)
    } catch (err) {
      setError(err instanceof Error && !('data' in err) ? err.message : errorMessage(err, 'Could not turn on notifications.'))
    } finally {
      setBusy(false)
    }
  }, [publicKey, saveSubscription])

  const disable = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const endpoint = await removePushSubscription()
      if (endpoint) await dropSubscription({ endpoint })
      setEnabled(false)
    } catch (err) {
      setError(errorMessage(err, 'Could not turn off notifications.'))
    } finally {
      setBusy(false)
    }
  }, [dropSubscription])

  return { support, enabled, busy, error, permission: pushPermission(), enable, disable }
}

// Everything this device holds for the account, cleared before signing out: a
// shared phone must stop receiving the last person's messages, and shouldn't keep
// their friends' photos. Capped so a dead connection can't hold up signing out;
// the browser's own subscription is gone either way, which is what stops delivery.
export function useSignOutCleanup() {
  const dropSubscription = useMutation(api.push.unsubscribe)

  return useCallback(async () => {
    const cleanup = (async () => {
      await clearPhotoCache()
      const endpoint = await removePushSubscription()
      if (endpoint) await dropSubscription({ endpoint })
    })().catch(() => {})
    await Promise.race([cleanup, new Promise((resolve) => setTimeout(resolve, 2000))])
  }, [dropSubscription])
}

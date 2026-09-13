import { useCallback } from 'react'
import { pushSubscribe, pushUnsubscribe } from '../api/client'
import { getVapidPublicKey } from './pushConfig'
import {
  decideSubscribe,
  toSubscribeRequest,
  vapidKeyToApplicationServerKey,
  type PermissionState,
} from './pushSubscriptionManager'

/** Feature-detect the full Web Push stack (jsdom-safe — no bare global references). */
function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/** Result of an ensureSubscribed attempt, so callers can react (e.g. log, show a hint). */
export type EnsureResult = 'subscribed' | 'resynced' | 'unsupported' | 'denied' | 'no-key' | 'error'

/**
 * Hook that wires the browser Push API to the backend subscription endpoints (assignment 05 §6).
 *
 * `ensureSubscribed()` is called by the driver mandatorily at login (UC-003 priming) and by the
 * customer PushPrompt accept (UC-004). It feature-detects, decides via the pure
 * `pushSubscriptionManager`, prompts for permission when needed, subscribes through the active
 * service-worker registration, and POSTs the subscription to the API. Every browser call is
 * guarded so it no-ops (never throws) in jsdom / unsupported browsers.
 *
 * `unsubscribeLocal()` removes the browser subscription and DELETEs it server-side (on logout).
 */
export function usePushSubscription() {
  const ensureSubscribed = useCallback(async (): Promise<EnsureResult> => {
    if (!isPushSupported()) return 'unsupported'

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()

    const decision = decideSubscribe({
      supported: true,
      permission: Notification.permission as PermissionState,
      hasExistingSubscription: existing !== null,
    })

    if (decision.action === 'skip') {
      return decision.reason === 'denied' ? 'denied' : 'unsupported'
    }

    // Already subscribed → re-POST to refresh LastUsedAt (idempotent upsert server-side).
    if (decision.action === 'resync') {
      return (await postSubscription(existing)) ? 'resynced' : 'error'
    }

    // decision.action === 'subscribe'
    if (decision.prompt) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return 'denied'
    }

    const key = getVapidPublicKey()
    if (!key) return 'no-key'

    let subscription: PushSubscription
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource: the Uint8Array is ArrayBuffer-backed, but lib.dom's strict
        // ArrayBufferLike/ArrayBuffer split rejects the inferred type without a widening cast.
        applicationServerKey: vapidKeyToApplicationServerKey(key) as BufferSource,
      })
    } catch {
      return 'error'
    }

    return (await postSubscription(subscription)) ? 'subscribed' : 'error'
  }, [])

  const unsubscribeLocal = useCallback(async (): Promise<void> => {
    if (!isPushSupported()) return
    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (!existing) return
      const endpoint = existing.endpoint
      await existing.unsubscribe()
      await pushUnsubscribe(endpoint)
    } catch {
      // Best-effort: a failed server DELETE is pruned later via the 410-on-next-send path.
    }
  }, [])

  return { ensureSubscribed, unsubscribeLocal }
}

/** POST the subscription to the API. Returns true on success, false on any failure. */
async function postSubscription(subscription: PushSubscription | null): Promise<boolean> {
  if (!subscription) return false
  const req = toSubscribeRequest(
    subscription.toJSON(),
    typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  )
  if (!req) return false
  try {
    await pushSubscribe(req)
    return true
  } catch {
    return false
  }
}

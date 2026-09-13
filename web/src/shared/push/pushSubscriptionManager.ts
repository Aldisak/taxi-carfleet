/**
 * Pure decision + mapping helpers for Web Push subscription wiring (assignment 05 §6).
 *
 * Kept side-effect-free so it unit-tests without a real browser: the impure shell
 * (`usePushSubscription.ts`) does the actual `Notification.requestPermission()`,
 * `registration.pushManager.subscribe()`, and API POST/DELETE calls, delegating every
 * decision here. No `window`/DOM references.
 */

import type { PushSubscribeRequest } from '../api/client'

/** The browser Notification permission states we branch on. */
export type PermissionState = 'default' | 'granted' | 'denied'

/** What the subscription shell should do next, given the current environment. */
export type SubscribeDecision =
  /** Push is unavailable (no SW / PushManager) — do nothing, silently. */
  | { action: 'skip'; reason: 'unsupported' }
  /** The user previously denied notifications — never re-prompt. */
  | { action: 'skip'; reason: 'denied' }
  /** Already subscribed on this device — re-POST to refresh LastUsedAt (idempotent upsert). */
  | { action: 'resync' }
  /** Permission already granted but no subscription yet — subscribe without prompting. */
  | { action: 'subscribe'; prompt: false }
  /** Permission undecided — prompt, then subscribe on grant. */
  | { action: 'subscribe'; prompt: true }

/** Inputs the pure decision needs from the impure shell. */
export interface SubscribeContext {
  /** Feature-detect result: ServiceWorker + PushManager + Notification all present. */
  supported: boolean
  /** Current Notification.permission. */
  permission: PermissionState
  /** Whether a browser PushSubscription already exists for this registration. */
  hasExistingSubscription: boolean
}

/**
 * Decide the next subscription step. The driver (mandatory at login) and the customer (after the
 * first order) share this logic — the caller only differs in WHEN it is invoked, not in the rules.
 */
export function decideSubscribe(ctx: SubscribeContext): SubscribeDecision {
  if (!ctx.supported) return { action: 'skip', reason: 'unsupported' }
  if (ctx.permission === 'denied') return { action: 'skip', reason: 'denied' }
  if (ctx.hasExistingSubscription) return { action: 'resync' }
  if (ctx.permission === 'granted') return { action: 'subscribe', prompt: false }
  return { action: 'subscribe', prompt: true }
}

/**
 * Convert a URL-safe base64 VAPID public key to the `Uint8Array` (`applicationServerKey`) the
 * Push API `subscribe()` call requires. Pure and environment-agnostic (uses `atob`, available in
 * both the worker and jsdom). Throws on malformed input so the shell can catch + skip.
 */
export function vapidKeyToApplicationServerKey(base64PublicKey: string): Uint8Array {
  const padding = '='.repeat((4 - (base64PublicKey.length % 4)) % 4)
  const base64 = (base64PublicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Map a browser `PushSubscription` (its JSON form) to the API request body for
 * POST /push/subscriptions. Returns `null` when the subscription lacks the required keys
 * (p256dh/auth) so the shell skips the POST rather than sending an invalid body.
 */
export function toSubscribeRequest(
  subscriptionJson: PushSubscriptionJSON,
  userAgent: string | undefined,
): PushSubscribeRequest | null {
  const endpoint = subscriptionJson.endpoint
  const p256dh = subscriptionJson.keys?.p256dh
  const auth = subscriptionJson.keys?.auth
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint,
    p256dh,
    auth,
    userAgent: userAgent && userAgent.length > 0 ? userAgent : undefined,
  }
}

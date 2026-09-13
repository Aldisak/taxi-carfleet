/**
 * Pure mapping from a raw Web Push payload to service-worker notification display options.
 *
 * This module is imported by BOTH the service worker (`src/sw.ts`, a worker context with no
 * DOM) and the vitest unit test (jsdom). It MUST stay pure — no `window`, no DOM, no
 * side-effects — so it loads cleanly in either environment (rules/web-architecture.md#pure-logic-modules).
 *
 * The backend push payload contract (assignment 05 §2) is:
 *   { title, body, url, tag, priority }
 * `priority` is `'high'` for the driver OfferToDriver takeover (requires interaction), `'normal'`
 * otherwise. `tag` collapses repeat notifications for the same logical subject (e.g. `'offer'`).
 */

/** A raw push payload as sent by the backend IPushSender (assignment 05 §2). */
export interface RawPushPayload {
  title: string
  body: string
  /** Absolute or app-relative URL to open/focus on notificationclick. */
  url?: string
  /** Collapse tag — a later notification with the same tag replaces the earlier one. */
  tag?: string
  /** `'high'` for the driver offer takeover; `'normal'`/absent otherwise. */
  priority?: 'high' | 'normal'
}

/** The subset of NotificationOptions the service worker passes to `showNotification`. */
export interface PushDisplay {
  title: string
  body: string
  /** Passed through to `data.url` so the click handler can open/focus it. */
  url: string | null
  tag: string | null
  /**
   * True for a high-priority driver offer — keeps the notification on screen until the driver
   * acts (assignment 05 §2: OfferToDriver uses `requireInteraction: true`).
   */
  requireInteraction: boolean
  /**
   * True when this payload represents a driver offer — the service worker forwards a message to
   * open clients so the in-app SignalR-driven offer sound can start (the SW itself cannot play
   * audio; sound is owned by `useOfferSound`).
   */
  isOffer: boolean
}

/** The known collapse tag for a driver offer notification. */
export const OFFER_TAG = 'offer'

/**
 * Safely parse the raw push payload from a `PushEvent`'s data. Returns `null` when the payload
 * is missing, not JSON, or has no usable title — the SW then shows nothing (never crashes).
 */
export function parsePushPayload(raw: string | null | undefined): RawPushPayload | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.title !== 'string' || obj.title.length === 0) return null
  return {
    title: obj.title,
    body: typeof obj.body === 'string' ? obj.body : '',
    url: typeof obj.url === 'string' ? obj.url : undefined,
    tag: typeof obj.tag === 'string' ? obj.tag : undefined,
    priority: obj.priority === 'high' ? 'high' : obj.priority === 'normal' ? 'normal' : undefined,
  }
}

/**
 * Map a raw push payload to the display options the service worker uses. A high-priority payload
 * OR the `offer` tag marks the driver offer takeover → `requireInteraction: true` + `isOffer`.
 */
export function toPushDisplay(payload: RawPushPayload): PushDisplay {
  const isOffer = payload.priority === 'high' || payload.tag === OFFER_TAG
  return {
    title: payload.title,
    body: payload.body,
    url: payload.url ?? null,
    tag: payload.tag ?? null,
    requireInteraction: isOffer,
    isOffer,
  }
}

/**
 * Resolve the URL to open/focus on notificationclick. Falls back to the app root `'/'` when the
 * payload carries no url (a notification is still actionable — clicking focuses the app).
 */
export function resolveClickUrl(url: string | null | undefined): string {
  return url && url.length > 0 ? url : '/'
}

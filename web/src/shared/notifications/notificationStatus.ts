/**
 * Pure mapping for dispatcher notification visibility (UC-005 B2, assignment 05 §5).
 *
 * Lives in `src/shared/` because it is consumed by both `features/orders/` (the NotificationsSection
 * in the order drawer) and `features/board/` (the OrderCard failed-SMS red icon) — a feature-local
 * module imported across features would be a banned cross-feature import
 * (rules/web-architecture.md#feature-folders).
 */

/** A single notification log item from the A6 OrderDetailDto `notifications` field. */
export interface OrderNotificationDto {
  /** Backend NotificationEvent enum value, e.g. "OrderCreatedForCustomer", "DriverArrived". */
  event: string
  /** Backend NotificationChannel enum value: "Sms" | "Push". */
  channel: string
  /** Recipient display string (phone / user id / endpoint) — already safe for display. */
  recipient: string
  /** Backend NotificationStatus: "Queued" | "Sent" | "Failed" | "SkippedCap" | "SkippedNoChannel". */
  status: string
  /** Provider error text when the send failed; null otherwise. */
  error?: string | null
  /** ISO UTC timestamp when the outbox/log row was created. */
  createdAt: string
  /** ISO UTC timestamp when the send succeeded; null until Sent. */
  sentAt?: string | null
}

/** Visual tone for a notification status pill — maps to theme tokens at render time. */
export type NotificationTone = 'success' | 'error' | 'muted' | 'neutral'

/** A rendered descriptor for a notification status: the i18n key + the visual tone. */
export interface NotificationStatusDescriptor {
  /** i18n key under `notifications.status.*` for the human label. */
  labelKey: string
  tone: NotificationTone
}

/**
 * Map a backend NotificationStatus string to its display descriptor.
 * Sent → success (green), Failed → error (red), Skipped* → muted (grey), Queued → neutral.
 * Unknown values fall back to neutral so a new backend status never crashes the UI.
 */
export function statusDescriptor(status: string): NotificationStatusDescriptor {
  switch (status) {
    case 'Sent':
      return { labelKey: 'notifications.status.sent', tone: 'success' }
    case 'Failed':
      return { labelKey: 'notifications.status.failed', tone: 'error' }
    case 'Queued':
      return { labelKey: 'notifications.status.queued', tone: 'neutral' }
    case 'SkippedCap':
      return { labelKey: 'notifications.status.skippedCap', tone: 'muted' }
    case 'SkippedNoChannel':
      return { labelKey: 'notifications.status.skippedNoChannel', tone: 'muted' }
    default:
      return { labelKey: 'notifications.status.unknown', tone: 'neutral' }
  }
}

/** i18n key under `notifications.channel.*` for a channel string (Sms/Push). */
export function channelLabelKey(channel: string): string {
  switch (channel) {
    case 'Sms':
      return 'notifications.channel.sms'
    case 'Push':
      return 'notifications.channel.push'
    default:
      return 'notifications.channel.unknown'
  }
}

/** i18n key under `notifications.event.*` for a backend NotificationEvent string. */
export function eventLabelKey(event: string): string {
  // The i18n file carries an entry per known event; the component uses t(key, event) so an
  // unmapped event degrades to its raw name rather than a missing-key blank.
  return `notifications.event.${event}`
}

/**
 * True when the order has at least one FAILED SMS notification — the dispatcher board renders a
 * red icon on the card so the dispatcher calls the customer instead (assignment 05 §5).
 * Only Sms+Failed qualifies: a failed push is not actionable by a phone call.
 */
export function hasFailedSms(notifications: readonly OrderNotificationDto[] | undefined | null): boolean {
  if (!notifications) return false
  return notifications.some(n => n.channel === 'Sms' && n.status === 'Failed')
}

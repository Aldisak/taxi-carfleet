/**
 * Shared audit/order-event label map. Lives in `src/shared` because it is consumed by
 * BOTH the orders feature (the order-detail drawer timeline) and the audit feature (the
 * /x/audit timeline) — a cross-feature import would violate rules/web-architecture.md,
 * so the single source of truth is promoted here (B2).
 */

/**
 * All 13 OrderEventType members (mirrors the C# OrderEventType enum). The canonical
 * source of truth for the order-event set; `features/orders/eventTimeline` re-exports it.
 */
export const ALL_ORDER_EVENT_TYPES = [
  'Created',
  'Assigned',
  'Accepted',
  'Declined',
  'Timeout',
  'Arrived',
  'Started',
  'Completed',
  'Cancelled',
  'Reassigned',
  'PriceOverridden',
  'NoteAdded',
  'Updated',
] as const

export type OrderEventType = (typeof ALL_ORDER_EVENT_TYPES)[number]

/**
 * Real AuditLog action strings (reconciled against the laneA7 backend). Today only the
 * dispatcher manual driver-status override writes audit_log (OverrideStatusEndpoint) with
 * `Action = "StatusOverride"`, entity `"Driver"`. A graceful fallback (audit.event.Unknown)
 * means any future unlabeled action never crashes the page.
 */
export const KNOWN_AUDIT_ACTIONS = ['StatusOverride'] as const

export type AuditAction = (typeof KNOWN_AUDIT_ACTIONS)[number]

/**
 * Maps an event/action string to an i18n key carrying its Czech label.
 *
 * Order-event types (incl. PriceOverridden) reuse the existing `orders.timeline.event.*`
 * keys so the order-detail drawer and the audit page share ONE label source. Audit-log
 * actions map to `audit.event.*`. Anything unrecognised falls back to
 * `audit.event.Unknown` — never a raw string, never a crash.
 */
export function auditEventLabelKey(event: string): string {
  if ((ALL_ORDER_EVENT_TYPES as readonly string[]).includes(event)) {
    return `orders.timeline.event.${event}`
  }
  if ((KNOWN_AUDIT_ACTIONS as readonly string[]).includes(event)) {
    return `audit.event.${event}`
  }
  return 'audit.event.Unknown'
}

/** The full set of event strings this module knows how to label (order events + audit actions). */
export function allLabelledEvents(): string[] {
  return [...ALL_ORDER_EVENT_TYPES, ...KNOWN_AUDIT_ACTIONS]
}

/**
 * All 13 OrderEventType members (mirrors C# OrderEventType enum).
 * Used by tests to ensure every type has an i18n key under orders.timeline.event.<Type>.
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

/** Formats an ISO timestamp as a human-readable Czech relative + absolute time string. */
export function formatEventTime(at: string): { relative: string; absolute: string } {
  const date = new Date(at)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  let relative: string
  if (diffSec < 60) {
    relative = `před ${diffSec} s`
  } else if (diffSec < 3600) {
    relative = `před ${Math.floor(diffSec / 60)} min`
  } else if (diffSec < 86400) {
    relative = `před ${Math.floor(diffSec / 3600)} h`
  } else {
    relative = `před ${Math.floor(diffSec / 86400)} d`
  }

  const absolute = date.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return { relative, absolute }
}

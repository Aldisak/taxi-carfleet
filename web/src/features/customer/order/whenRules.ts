/** Minimum lead time for a scheduled ("Na čas") order, in minutes (spec §2). */
export const MIN_LEAD_MINUTES = 20

/** Maximum lead time for a scheduled order, in days (spec §2). */
export const MAX_LEAD_DAYS = 7

const MIN_LEAD_MS = MIN_LEAD_MINUTES * 60_000
const MAX_LEAD_MS = MAX_LEAD_DAYS * 24 * 60 * 60_000

/** Result of validating a scheduled pickup time. */
export type ScheduledAtValidation = 'ok' | 'tooSoon' | 'tooLate' | 'invalid'

/** The earliest selectable scheduled time: now + 20 min. */
export function minScheduledAt(): Date {
  return new Date(Date.now() + MIN_LEAD_MS)
}

/** The latest selectable scheduled time: now + 7 days. */
export function maxScheduledAt(): Date {
  return new Date(Date.now() + MAX_LEAD_MS)
}

/**
 * Validates a "Na čas" scheduled pickup time against the +20 min / +7 day window (spec §2).
 * Pure and clock-driven via Date.now() so it is fake-timer testable.
 *
 * @param isoString The chosen pickup time as an ISO string.
 */
export function validateScheduledAt(isoString: string): ScheduledAtValidation {
  const ms = Date.parse(isoString)
  if (Number.isNaN(ms)) return 'invalid'

  const leadMs = ms - Date.now()
  if (leadMs < MIN_LEAD_MS) return 'tooSoon'
  if (leadMs > MAX_LEAD_MS) return 'tooLate'
  return 'ok'
}

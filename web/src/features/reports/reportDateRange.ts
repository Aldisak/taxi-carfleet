/**
 * Pure date-range helpers for the reports screen. The default range is "this month"
 * expressed in Europe/Prague calendar days (assignment 07 §1) as ISO yyyy-MM-dd
 * strings — the wire format the report endpoints expect.
 */

const PRAGUE_TZ = 'Europe/Prague'

/** Returns the Prague-local calendar parts (year, month 1-12, day) for an instant. */
function pragueParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRAGUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string): number =>
    Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Formats y/m/d parts as an ISO yyyy-MM-dd string. */
function iso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** An inclusive [from, to] range of Prague-local ISO day strings. */
export interface DateRange {
  from: string
  to: string
}

/**
 * Default report range: the first day of the current Prague month through today
 * (Prague-local). `now` is injected for deterministic tests (no Date.now in logic).
 */
export function defaultThisMonthRange(now: Date): DateRange {
  const { year, month, day } = pragueParts(now)
  return {
    from: iso(year, month, 1),
    to: iso(year, month, day),
  }
}

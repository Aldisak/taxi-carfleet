/**
 * Pure date-range helpers for analytics and reports. All ranges are expressed as
 * Prague-local ISO yyyy-MM-dd strings — the wire format the analytics endpoints expect.
 *
 * `now` is always injected for deterministic tests (never `new Date()` inside logic).
 */

const PRAGUE_TZ = 'Europe/Prague'

/** Returns the Prague-local calendar parts for an instant. */
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

/**
 * Adds `days` calendar days to an ISO yyyy-MM-dd date string.
 * Uses UTC noon arithmetic to avoid DST boundary issues.
 */
function addDaysToIso(isoDate: string, days: number): string {
  // Parse the ISO date as UTC noon to avoid any DST or timezone shift issues.
  const ms = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
    12,
    0,
    0,
  )
  const result = new Date(ms + days * 86_400_000)
  const y = result.getUTCFullYear()
  const m = String(result.getUTCMonth() + 1).padStart(2, '0')
  const d = String(result.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Returns the last day of the given Prague month as an ISO string. */
function lastDayOfMonth(year: number, month: number): string {
  // Use the 0-day trick: day 0 of month+1 = last day of month
  const d = new Date(Date.UTC(year, month, 0, 12)) // month is 1-based, Date uses 0-based
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Counts calendar days between two ISO yyyy-MM-dd strings (inclusive on both ends). */
function daysBetween(from: string, to: string): number {
  const fromMs = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  )
  const toMs = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  )
  return Math.round((toMs - fromMs) / 86_400_000) + 1
}

/** An inclusive [from, to] range of Prague-local ISO day strings. */
export interface DateRange {
  from: string
  to: string
}

/** All supported preset identifiers. */
export type RangePreset =
  | 'dnes'
  | '7dni'
  | 'tentoMesic'
  | 'minulyMesic'
  | 'kvartal'
  | 'rok'
  | 'vlastni'

/** All computed presets except 'vlastni' (which is user-supplied). */
export type ComputedPresets = Omit<Record<RangePreset, DateRange>, 'vlastni'> & { vlastni?: DateRange }

/**
 * Default report range: the first day of the current Prague month through today (Prague-local).
 * Re-exported for backward-compatibility with `features/reports/reportDateRange.ts`.
 */
export function defaultThisMonthRange(now: Date): DateRange {
  const { year, month, day } = pragueParts(now)
  return {
    from: iso(year, month, 1),
    to: iso(year, month, day),
  }
}

/**
 * Computes all named preset date ranges relative to `now` (Prague-local).
 *
 * - dnes: today (Prague)
 * - 7dni: last 7 days ending today (today - 6 days .. today)
 * - tentoMesic: 1st of current month .. today
 * - minulyMesic: full previous calendar month
 * - kvartal: 1st of current quarter .. today (Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct)
 * - rok: 1st Jan of current year .. today
 * - vlastni: undefined (caller provides it)
 */
export function presetRanges(now: Date): ComputedPresets {
  const { year, month, day } = pragueParts(now)
  const today = iso(year, month, day)

  // 7dni: today and 6 previous days = today - 6 days
  const sevenDaysAgo = addDaysToIso(today, -6)

  // minulyMesic
  const prevMonth = month === 1 ? 12 : month - 1
  const prevMonthYear = month === 1 ? year - 1 : year
  const prevMonthFrom = iso(prevMonthYear, prevMonth, 1)
  const prevMonthTo = lastDayOfMonth(prevMonthYear, prevMonth)

  // kvartal: Q1=Jan(1), Q2=Apr(4), Q3=Jul(7), Q4=Oct(10)
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  const quarterFrom = iso(year, quarterStartMonth, 1)

  // rok
  const rokFrom = iso(year, 1, 1)

  return {
    dnes: { from: today, to: today },
    '7dni': { from: sevenDaysAgo, to: today },
    tentoMesic: { from: iso(year, month, 1), to: today },
    minulyMesic: { from: prevMonthFrom, to: prevMonthTo },
    kvartal: { from: quarterFrom, to: today },
    rok: { from: rokFrom, to: today },
  }
}

/**
 * Returns the immediately preceding period of equal length to `range`.
 * E.g. if range = 2026-09-01..2026-09-13 (13 days), returns 2026-08-19..2026-08-31.
 */
export function previousPeriodOf(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to) // inclusive day count
  // Previous period ends the day before range.from
  const newTo = addDaysToIso(range.from, -1)
  // Previous period starts len-1 days before newTo
  const newFrom = addDaysToIso(newTo, -(len - 1))
  return { from: newFrom, to: newTo }
}

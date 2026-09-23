import type { MyOrderHistoryItemDto } from '../../../shared/api/client'
import type { PillTone } from '../../../shared/ui'
import { historyRowTimestamp } from './historyRules'

/**
 * Presentational grouping helpers for the restyled history screen (UC-020 WI-5). Pure — components
 * render, this module decides (rules/web-architecture.md#pure-logic-modules). Lives inside the
 * history folder because it is presentation-only (the day headers + pill tones the redesign added);
 * the data/decision logic in `historyRules.ts` stays untouched.
 */

/** One day-bucket of history rows: a Prague-day label plus its rides, in server order. */
export interface HistoryDayGroup {
  /** Stable bucket key (yyyy-MM-dd in Europe/Prague) — safe as a React key. */
  key: string
  /** Human day label formatted for display (cs-CZ, Europe/Prague). */
  label: string
  /** The rides that fall on this Prague day, in the original input order. */
  items: MyOrderHistoryItemDto[]
}

// yyyy-MM-dd in Europe/Prague — a stable, locale-independent bucket key. Dates stay Europe/Prague in
// every UI language (rules/web-react-style.md#dates-and-money).
const pragueDayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Human day label (e.g. "10. 9. 2026") in cs-CZ, Europe/Prague.
const pragueDayLabel = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
})

/**
 * Buckets history rows into Prague-day groups, keyed off {@link historyRowTimestamp} (completedAt ??
 * createdAt). Preserves the server's input order both within and across groups — the API returns
 * newest-first, so the newest day header comes first. A UTC timestamp late in the day correctly
 * rolls into the next Prague day (CEST/CET offset handled by `Intl` with the `Europe/Prague` zone).
 */
export function groupByPragueDay(items: readonly MyOrderHistoryItemDto[]): HistoryDayGroup[] {
  const buckets = new Map<string, HistoryDayGroup>()

  for (const order of items) {
    const iso = historyRowTimestamp(order)
    const date = new Date(iso)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? pragueDayKey.format(date) : iso
    const label = valid ? pragueDayLabel.format(date) : iso

    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(order)
    } else {
      buckets.set(key, { key, label, items: [order] })
    }
  }

  return [...buckets.values()]
}

/**
 * Maps a backend status name to the {@link PillTone} for the status pill: Completed → success,
 * Cancelled → danger, anything else (an in-flight ride still shown in the list) → info. Mirrors the
 * key set in `historyRules.historyStatusKey`.
 */
export function historyStatusTone(status: string): PillTone {
  switch (status) {
    case 'Completed':
      return 'success'
    case 'Cancelled':
      return 'danger'
    default:
      return 'info'
  }
}

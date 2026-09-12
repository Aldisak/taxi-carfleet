import type { MyOrderHistoryItemDto } from '../../../shared/api/client'

/**
 * Pure decision logic for the history list (B-history). Components render; this module decides
 * (rules/web-architecture.md#pure-logic-modules). No .tsx twin, so the filename is safe on
 * case-insensitive Windows.
 */

/** Whether the history list is empty (drives the "Zatím žádné jízdy" empty state). */
export function isHistoryEmpty(items: readonly MyOrderHistoryItemDto[]): boolean {
  return items.length === 0
}

/**
 * The display price for a history row in integer CZK: the settled final price wins, else the
 * agreed fixed price, else null (unknown — e.g. a cancelled/estimate order never completed).
 * The caller formats with Intl.NumberFormat('cs-CZ') at render.
 */
export function historyRowPriceCzk(order: Pick<MyOrderHistoryItemDto, 'finalPriceCzk' | 'fixedPriceCzk'>): number | null {
  return order.finalPriceCzk ?? order.fixedPriceCzk ?? null
}

/**
 * Maps a backend status name to the i18n key for the history status pill. Completed and
 * Cancelled are the common terminal rows; anything else (an in-flight order that still shows in
 * the list) maps to the generic "active" label.
 */
export function historyStatusKey(status: string): string {
  switch (status) {
    case 'Completed':
      return 'customer.history.statusCompleted'
    case 'Cancelled':
      return 'customer.history.statusCancelled'
    default:
      return 'customer.history.statusActive'
  }
}

/** The timestamp shown for a row: completion time when present, else creation time (ISO). */
export function historyRowTimestamp(order: Pick<MyOrderHistoryItemDto, 'completedAt' | 'createdAt'>): string {
  return order.completedAt ?? order.createdAt
}

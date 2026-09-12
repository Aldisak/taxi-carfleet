import type { OrderSummaryDto } from '../../shared/api/client'

/** Board sections for the middle column. */
export const OrderSection = {
  /** Unassigned ASAP orders. */
  Nove: 'Nove',
  /** Assigned/waiting-accept ASAP orders. */
  Prirazene: 'Prirazene',
  /** Active rides (Accepted, Arrived, InProgress). */
  Probihajici: 'Probihajici',
  /** Scheduled today or tomorrow (New or Assigned with scheduledAt). */
  Naplanovane: 'Naplanovane',
  /** Completed today. Collapsed by default. */
  DokonceneDnes: 'DokonceneDnes',
} as const

export type OrderSection = (typeof OrderSection)[keyof typeof OrderSection]

/**
 * Returns the local calendar date string (YYYY-MM-DD) for the given Date.
 * Uses local year/month/day components so that "today" and "tomorrow" match
 * what the dispatcher sees in their browser timezone (e.g. Europe/Prague).
 * Avoids arithmetic like +86_400_000 which is DST-unsafe — uses Date constructor
 * with explicit year/month/day components instead.
 */
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns the local date string for the calendar day after the given Date. DST-safe. */
function localTomorrowStr(d: Date): string {
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
}

/**
 * Buckets a single order into a board section.
 * Returns null when the order should not appear on the board
 * (Cancelled, Completed from a prior day, or scheduled beyond tomorrow).
 * Dates use the local calendar day (browser/dispatcher timezone), not UTC.
 */
export function bucketOrder(order: OrderSummaryDto, now: Date): OrderSection | null {
  const todayStr = localDateStr(now)
  const tomorrowStr = localTomorrowStr(now)

  switch (order.status) {
    case 'New': {
      if (order.scheduledAt) {
        const scheduledDateStr = localDateStr(new Date(order.scheduledAt))
        if (scheduledDateStr === todayStr || scheduledDateStr === tomorrowStr) {
          return OrderSection.Naplanovane
        }
        // Beyond tomorrow → not shown
        return null
      }
      return OrderSection.Nove
    }

    case 'Assigned': {
      if (order.scheduledAt) {
        const scheduledDateStr = localDateStr(new Date(order.scheduledAt))
        if (scheduledDateStr === todayStr || scheduledDateStr === tomorrowStr) {
          return OrderSection.Naplanovane
        }
        return null
      }
      return OrderSection.Prirazene
    }

    case 'Accepted':
    case 'Arrived':
    case 'InProgress':
      return OrderSection.Probihajici

    case 'Completed': {
      const createdDateStr = localDateStr(new Date(order.createdAt))
      if (createdDateStr === todayStr) {
        return OrderSection.DokonceneDnes
      }
      return null
    }

    case 'Cancelled':
    default:
      return null
  }
}

/** Groups a list of orders into sections. Returns entries in the display order. */
export function groupOrdersBySection(
  orders: OrderSummaryDto[],
  now: Date,
): Map<OrderSection, OrderSummaryDto[]> {
  const result = new Map<OrderSection, OrderSummaryDto[]>([
    [OrderSection.Nove, []],
    [OrderSection.Prirazene, []],
    [OrderSection.Probihajici, []],
    [OrderSection.Naplanovane, []],
    [OrderSection.DokonceneDnes, []],
  ])

  for (const order of orders) {
    const section = bucketOrder(order, now)
    if (section !== null) {
      result.get(section)!.push(order)
    }
  }

  return result
}

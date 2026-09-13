import type { DriverReportDayDto } from '../../shared/api/client'

/** The summable numeric columns of the driver report (excludes avgRating). */
export interface ReportTotals {
  ridesCompleted: number
  ridesCancelled: number
  cashCzk: number
  cardCzk: number
  invoiceCzk: number
  totalCzk: number
  hoursOnline: number
  priceOverrideCount: number
}

const ZERO: ReportTotals = {
  ridesCompleted: 0,
  ridesCancelled: 0,
  cashCzk: 0,
  cardCzk: 0,
  invoiceCzk: 0,
  totalCzk: 0,
  hoursOnline: 0,
  priceOverrideCount: 0,
}

/**
 * Sums per-day rows into a totals row. The server already returns an authoritative
 * totals object, but recomputing client-side gives a deterministic fallback for the
 * table footer and a pure, unit-testable module (rules/web-architecture.md#pure-logic-modules).
 */
export function sumDays(days: readonly DriverReportDayDto[]): ReportTotals {
  return days.reduce<ReportTotals>(
    (acc, d) => ({
      ridesCompleted: acc.ridesCompleted + d.ridesCompleted,
      ridesCancelled: acc.ridesCancelled + d.ridesCancelled,
      cashCzk: acc.cashCzk + d.cashCzk,
      cardCzk: acc.cardCzk + d.cardCzk,
      invoiceCzk: acc.invoiceCzk + d.invoiceCzk,
      totalCzk: acc.totalCzk + d.totalCzk,
      hoursOnline: acc.hoursOnline + d.hoursOnline,
      priceOverrideCount: acc.priceOverrideCount + d.priceOverrideCount,
    }),
    { ...ZERO },
  )
}

import type { MyOrder } from '../../../shared/api/client'

/** Per-payment-type totals and ride count for a day of driver history. */
export interface HistoryTotals {
  /** Number of completed rides. */
  ridesCount: number
  /** Sum of final prices paid in cash (integer CZK). */
  cashTotalCzk: number
  /** Sum of final prices paid by card (integer CZK). */
  cardTotalCzk: number
  /** Sum of final prices invoiced (integer CZK). */
  invoiceTotalCzk: number
}

/**
 * Computes per-payment-type totals over a day's rides.
 *
 * Only Completed rides contribute to the count and the totals; active rides
 * (Assigned/Accepted/Arrived/InProgress) carry a null price and payment type and
 * are skipped so they neither inflate the count nor produce NaN sums.
 */
export function computeHistoryTotals(orders: readonly MyOrder[]): HistoryTotals {
  const totals: HistoryTotals = {
    ridesCount: 0,
    cashTotalCzk: 0,
    cardTotalCzk: 0,
    invoiceTotalCzk: 0,
  }

  for (const order of orders) {
    if (order.status !== 'Completed') continue
    totals.ridesCount += 1

    const price = order.finalPriceCzk ?? 0
    switch (order.paymentType) {
      case 'Cash':
        totals.cashTotalCzk += price
        break
      case 'Card':
        totals.cardTotalCzk += price
        break
      case 'Invoice':
        totals.invoiceTotalCzk += price
        break
      default:
        break
    }
  }

  return totals
}

import { describe, it, expect } from 'vitest'
import { computeHistoryTotals } from './historyTotals'
import type { MyOrder } from '../../../shared/api/client'

function order(overrides: Partial<MyOrder>): MyOrder {
  return {
    id: crypto.randomUUID(),
    publicCode: 'A-1',
    status: 'Completed',
    pickupAddress: 'Náměstí 1',
    dropoffAddress: 'Nádraží',
    priceType: 'Fixed',
    finalPriceCzk: 100,
    paymentType: 'Cash',
    completedAt: '2026-09-12T10:00:00Z',
    ...overrides,
  }
}

describe('computeHistoryTotals', () => {
  it('returns all-zero totals and zero count for an empty day', () => {
    const result = computeHistoryTotals([])
    expect(result).toEqual({
      ridesCount: 0,
      cashTotalCzk: 0,
      cardTotalCzk: 0,
      invoiceTotalCzk: 0,
    })
  })

  it('sums final prices grouped by payment type', () => {
    const orders: MyOrder[] = [
      order({ paymentType: 'Cash', finalPriceCzk: 100 }),
      order({ paymentType: 'Cash', finalPriceCzk: 50 }),
      order({ paymentType: 'Card', finalPriceCzk: 200 }),
      order({ paymentType: 'Invoice', finalPriceCzk: 300 }),
    ]
    const result = computeHistoryTotals(orders)
    expect(result.cashTotalCzk).toBe(150)
    expect(result.cardTotalCzk).toBe(200)
    expect(result.invoiceTotalCzk).toBe(300)
  })

  it('counts only completed rides, ignoring active rides with null price/payment', () => {
    const orders: MyOrder[] = [
      order({ status: 'Completed', paymentType: 'Cash', finalPriceCzk: 100 }),
      // active ride — carries null price and payment; must not count or sum
      order({ status: 'InProgress', paymentType: null, finalPriceCzk: null, completedAt: null }),
      order({ status: 'Accepted', paymentType: null, finalPriceCzk: null, completedAt: null }),
    ]
    const result = computeHistoryTotals(orders)
    expect(result.ridesCount).toBe(1)
    expect(result.cashTotalCzk).toBe(100)
    expect(result.cardTotalCzk).toBe(0)
    expect(result.invoiceTotalCzk).toBe(0)
  })

  it('does not NaN when finalPriceCzk is null but paymentType is set', () => {
    const orders: MyOrder[] = [
      order({ status: 'Completed', paymentType: 'Cash', finalPriceCzk: null }),
    ]
    const result = computeHistoryTotals(orders)
    expect(result.cashTotalCzk).toBe(0)
    expect(result.ridesCount).toBe(1)
  })
})

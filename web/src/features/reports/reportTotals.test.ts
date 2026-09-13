import { describe, it, expect } from 'vitest'
import { sumDays } from './reportTotals'
import type { DriverReportDayDto } from '../../shared/api/client'

function day(overrides: Partial<DriverReportDayDto>): DriverReportDayDto {
  return {
    date: '2026-09-01',
    ridesCompleted: 0,
    ridesCancelled: 0,
    cashCzk: 0,
    cardCzk: 0,
    invoiceCzk: 0,
    totalCzk: 0,
    hoursOnline: 0,
    priceOverrideCount: 0,
    ...overrides,
  }
}

describe('sumDays', () => {
  it('returns all-zero totals for no rows', () => {
    expect(sumDays([])).toEqual({
      ridesCompleted: 0,
      ridesCancelled: 0,
      cashCzk: 0,
      cardCzk: 0,
      invoiceCzk: 0,
      totalCzk: 0,
      hoursOnline: 0,
      priceOverrideCount: 0,
    })
  })

  it('sums each column across rows', () => {
    const totals = sumDays([
      day({ ridesCompleted: 3, cashCzk: 300, totalCzk: 300, hoursOnline: 6, priceOverrideCount: 1 }),
      day({ ridesCompleted: 2, ridesCancelled: 1, cardCzk: 200, totalCzk: 200, hoursOnline: 4 }),
    ])
    expect(totals.ridesCompleted).toBe(5)
    expect(totals.ridesCancelled).toBe(1)
    expect(totals.cashCzk).toBe(300)
    expect(totals.cardCzk).toBe(200)
    expect(totals.totalCzk).toBe(500)
    expect(totals.hoursOnline).toBe(10)
    expect(totals.priceOverrideCount).toBe(1)
  })
})

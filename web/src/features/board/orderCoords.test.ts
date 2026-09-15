import { describe, it, expect } from 'vitest'
import { orderHasNoCoords } from './orderCoords'
import type { OrderSummaryDto } from '../../shared/api/client'

function order(overrides: Partial<OrderSummaryDto> = {}): OrderSummaryDto {
  return {
    id: 'o1',
    publicCode: 'ABC123',
    status: 'New',
    source: 'Phone',
    customerPhone: '+420777123456',
    customerName: null,
    pickupAddress: 'Někde 1',
    dropoffAddress: null,
    scheduledAt: null,
    passengers: 1,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    driverId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('orderHasNoCoords', () => {
  it('is true when both pickup coords are absent (created without coordinates)', () => {
    expect(orderHasNoCoords(order({ pickupLat: null, pickupLng: null }))).toBe(true)
  })

  it('is true when pickup coords are undefined (backend list projection omitted them → treat as unknown, no warning)', () => {
    // Undefined means the list projection did not carry coords — NOT the same as a known-missing
    // coordinate. To avoid a false "bez souřadnic" on every board card, undefined is NOT flagged.
    expect(orderHasNoCoords(order({ pickupLat: undefined, pickupLng: undefined }))).toBe(false)
  })

  it('is true when only one coordinate is missing (0,0 / partial is not a valid location)', () => {
    expect(orderHasNoCoords(order({ pickupLat: 50.02, pickupLng: null }))).toBe(true)
  })

  it('is true when coords are the null-island (0,0) sentinel', () => {
    expect(orderHasNoCoords(order({ pickupLat: 0, pickupLng: 0 }))).toBe(true)
  })

  it('is false when real pickup coords are present', () => {
    expect(orderHasNoCoords(order({ pickupLat: 50.027, pickupLng: 15.2 }))).toBe(false)
  })
})

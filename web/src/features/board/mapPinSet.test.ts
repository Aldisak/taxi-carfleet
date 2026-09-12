import { describe, it, expect } from 'vitest'
import { derivePinSet } from './mapPinSet'
import type { PinnableOrder } from './mapPinSet'

const base: PinnableOrder = {
  id: '1',
  status: 'New',
  pickupLat: 50.0,
  pickupLng: 15.2,
  pickupAddress: 'Test',
  publicCode: 'ABC123',
}

describe('derivePinSet — pickup pins for New/Assigned with coords', () => {
  it('includes New orders with coords', () => {
    const pins = derivePinSet([base])
    expect(pins).toHaveLength(1)
    expect(pins[0].id).toBe('1')
  })

  it('includes Assigned orders with coords', () => {
    const order = { ...base, status: 'Assigned' }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(1)
  })

  it('excludes orders with null lat', () => {
    const order: PinnableOrder = { ...base, pickupLat: null, pickupLng: null }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(0)
  })

  it('excludes InProgress orders', () => {
    const order = { ...base, status: 'InProgress' }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(0)
  })

  it('excludes Completed orders', () => {
    const order = { ...base, status: 'Completed' }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(0)
  })

  it('excludes Cancelled orders', () => {
    const order = { ...base, status: 'Cancelled' }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(0)
  })

  it('excludes Accepted orders (driver en route, no longer needs pin)', () => {
    const order = { ...base, status: 'Accepted' }
    const pins = derivePinSet([order])
    expect(pins).toHaveLength(0)
  })

  it('handles empty order list', () => {
    const pins = derivePinSet([])
    expect(pins).toHaveLength(0)
  })
})

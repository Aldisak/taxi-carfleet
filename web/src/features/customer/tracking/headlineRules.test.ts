import { describe, it, expect } from 'vitest'
import { deriveHeadline } from './headlineRules'
import type { TrackVm } from './headlineRules'

function vm(overrides: Partial<TrackVm>): TrackVm {
  return {
    status: 'New',
    driverFirstName: null,
    etaMinutes: null,
    vehiclePlate: null,
    vehicleColor: null,
    dropoffAddress: null,
    priceCzk: null,
    ...overrides,
  }
}

describe('deriveHeadline', () => {
  it('New → looking-for-driver, no extra fields', () => {
    const h = deriveHeadline(vm({ status: 'New' }))
    expect(h.key).toBe('customer.tracking.headline.new')
    expect(h.showVehicle).toBe(false)
    expect(h.showRating).toBe(false)
    expect(h.showCancel).toBe(true)
  })

  it('Assigned → driver-coming with name, omits ~min when eta is null (pre-06)', () => {
    const h = deriveHeadline(vm({ status: 'Assigned', driverFirstName: 'Petr', etaMinutes: null }))
    expect(h.key).toBe('customer.tracking.headline.assignedNoEta')
    expect(h.values).toMatchObject({ name: 'Petr' })
    expect(h.showCancel).toBe(true)
  })

  it('Accepted with an eta → driver-coming with ~min', () => {
    const h = deriveHeadline(vm({ status: 'Accepted', driverFirstName: 'Petr', etaMinutes: 6 }))
    expect(h.key).toBe('customer.tracking.headline.assignedEta')
    expect(h.values).toMatchObject({ name: 'Petr', eta: 6 })
    expect(h.showCancel).toBe(true)
  })

  it('Accepted shows the post-accepted cancel hint', () => {
    const h = deriveHeadline(vm({ status: 'Accepted', driverFirstName: 'Petr' }))
    expect(h.showAcceptedHint).toBe(true)
  })

  it('Assigned does NOT show the post-accepted hint', () => {
    const h = deriveHeadline(vm({ status: 'Assigned' }))
    expect(h.showAcceptedHint).toBe(false)
  })

  it('Arrived → driver-here + vehicle shown, cancel not allowed', () => {
    const h = deriveHeadline(vm({ status: 'Arrived', vehiclePlate: '1AB 2345', vehicleColor: 'černá' }))
    expect(h.key).toBe('customer.tracking.headline.arrived')
    expect(h.showVehicle).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('InProgress → riding + dropoff', () => {
    const h = deriveHeadline(vm({ status: 'InProgress', dropoffAddress: 'Náměstí 1' }))
    expect(h.key).toBe('customer.tracking.headline.inProgress')
    expect(h.showDropoff).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('Completed → done with price + rating seam', () => {
    const h = deriveHeadline(vm({ status: 'Completed', priceCzk: 110 }))
    expect(h.key).toBe('customer.tracking.headline.completed')
    expect(h.values).toMatchObject({ price: 110 })
    expect(h.showRating).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('Completed with no known price falls back to the done-no-price key', () => {
    const h = deriveHeadline(vm({ status: 'Completed', priceCzk: null }))
    expect(h.key).toBe('customer.tracking.headline.completedNoPrice')
    expect(h.showRating).toBe(true)
  })

  it('Cancelled → cancelled headline + call fallback, cancel not allowed', () => {
    const h = deriveHeadline(vm({ status: 'Cancelled' }))
    expect(h.key).toBe('customer.tracking.headline.cancelled')
    expect(h.showCall).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('unknown status falls back to the new headline and blocks cancel', () => {
    const h = deriveHeadline(vm({ status: 'Something' }))
    expect(h.key).toBe('customer.tracking.headline.new')
    expect(h.showCancel).toBe(false)
  })
})

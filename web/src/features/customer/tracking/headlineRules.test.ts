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
  it('New → looking-for-driver, searching phase, no extra fields', () => {
    const h = deriveHeadline(vm({ status: 'New' }))
    expect(h.phase).toBe('searching')
    expect(h.key).toBe('customer.tracking.headline.new')
    expect(h.showVehicle).toBe(false)
    expect(h.showRating).toBe(false)
    expect(h.showCancel).toBe(true)
  })

  it('Assigned → collapses to the searching phase with the looking-for-driver heading', () => {
    const h = deriveHeadline(vm({ status: 'Assigned', driverFirstName: 'Petr', etaMinutes: null }))
    expect(h.phase).toBe('searching')
    expect(h.key).toBe('customer.tracking.headline.new')
    expect(h.showCancel).toBe(true)
  })

  it('Assigned with an eta still uses the searching heading (loader is never paired with an ETA)', () => {
    const h = deriveHeadline(vm({ status: 'Assigned', driverFirstName: 'Petr', etaMinutes: 6 }))
    expect(h.phase).toBe('searching')
    expect(h.key).toBe('customer.tracking.headline.new')
  })

  it('Accepted with an eta → assigned phase, driver-coming with ~min', () => {
    const h = deriveHeadline(vm({ status: 'Accepted', driverFirstName: 'Petr', etaMinutes: 6 }))
    expect(h.phase).toBe('assigned')
    expect(h.key).toBe('customer.tracking.headline.assignedEta')
    expect(h.values).toMatchObject({ name: 'Petr', eta: 6 })
    expect(h.showCancel).toBe(true)
  })

  it('Accepted without an eta → assigned phase, no-eta heading', () => {
    const h = deriveHeadline(vm({ status: 'Accepted', driverFirstName: 'Petr', etaMinutes: null }))
    expect(h.phase).toBe('assigned')
    expect(h.key).toBe('customer.tracking.headline.assignedNoEta')
    expect(h.values).toMatchObject({ name: 'Petr' })
  })

  it('Accepted shows the post-accepted cancel hint', () => {
    const h = deriveHeadline(vm({ status: 'Accepted', driverFirstName: 'Petr' }))
    expect(h.showAcceptedHint).toBe(true)
  })

  it('Assigned does NOT show the post-accepted hint', () => {
    const h = deriveHeadline(vm({ status: 'Assigned' }))
    expect(h.showAcceptedHint).toBe(false)
  })

  it('Arrived → arrived phase + vehicle shown, cancel not allowed', () => {
    const h = deriveHeadline(vm({ status: 'Arrived', vehiclePlate: '1AB 2345', vehicleColor: 'černá' }))
    expect(h.phase).toBe('arrived')
    expect(h.key).toBe('customer.tracking.headline.arrived')
    expect(h.showVehicle).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('InProgress → inProgress phase + dropoff', () => {
    const h = deriveHeadline(vm({ status: 'InProgress', dropoffAddress: 'Náměstí 1' }))
    expect(h.phase).toBe('inProgress')
    expect(h.key).toBe('customer.tracking.headline.inProgress')
    expect(h.showDropoff).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('Completed → completed phase, done with price + rating seam', () => {
    const h = deriveHeadline(vm({ status: 'Completed', priceCzk: 110 }))
    expect(h.phase).toBe('completed')
    expect(h.key).toBe('customer.tracking.headline.completed')
    expect(h.values).toMatchObject({ price: 110 })
    expect(h.showRating).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('Completed with no known price falls back to the done-no-price key', () => {
    const h = deriveHeadline(vm({ status: 'Completed', priceCzk: null }))
    expect(h.phase).toBe('completed')
    expect(h.key).toBe('customer.tracking.headline.completedNoPrice')
    expect(h.showRating).toBe(true)
  })

  it('Cancelled → cancelled phase + call fallback, cancel not allowed', () => {
    const h = deriveHeadline(vm({ status: 'Cancelled' }))
    expect(h.phase).toBe('cancelled')
    expect(h.key).toBe('customer.tracking.headline.cancelled')
    expect(h.showCall).toBe(true)
    expect(h.showCancel).toBe(false)
  })

  it('unknown status falls back to the searching phase + new headline and blocks cancel', () => {
    const h = deriveHeadline(vm({ status: 'Something' }))
    expect(h.phase).toBe('searching')
    expect(h.key).toBe('customer.tracking.headline.new')
    expect(h.showCancel).toBe(false)
  })
})

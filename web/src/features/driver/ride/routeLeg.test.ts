import { describe, it, expect } from 'vitest'
import { selectRouteLeg, legEndpoint } from './routeLeg'

describe('selectRouteLeg', () => {
  it('Accepted -> toPickup', () => {
    expect(selectRouteLeg({ status: 'Accepted', hasDropoff: true })).toBe('toPickup')
  })

  it('Arrived -> toPickup (still the pickup approach until Start)', () => {
    expect(selectRouteLeg({ status: 'Arrived', hasDropoff: true })).toBe('toPickup')
  })

  it('InProgress with dropoff -> toDropoff', () => {
    expect(selectRouteLeg({ status: 'InProgress', hasDropoff: true })).toBe('toDropoff')
  })

  it('InProgress without dropoff -> null (skip the leg)', () => {
    expect(selectRouteLeg({ status: 'InProgress', hasDropoff: false })).toBeNull()
  })

  it('Free -> null', () => {
    expect(selectRouteLeg({ status: 'Free', hasDropoff: true })).toBeNull()
  })

  it('Completed -> null', () => {
    expect(selectRouteLeg({ status: 'Completed', hasDropoff: true })).toBeNull()
  })

  it('unknown status -> null', () => {
    expect(selectRouteLeg({ status: 'Nonsense', hasDropoff: true })).toBeNull()
  })
})

describe('legEndpoint', () => {
  const order = {
    pickupLat: 50.08,
    pickupLng: 14.42,
    dropoffLat: 50.1,
    dropoffLng: 14.5,
  }
  const orderNoDropoff = {
    pickupLat: 50.08,
    pickupLng: 14.42,
    dropoffLat: null,
    dropoffLng: null,
  }

  it("toPickup -> pickup coords", () => {
    expect(legEndpoint('toPickup', order)).toEqual({ lat: 50.08, lng: 14.42 })
  })

  it('toDropoff with a dropoff -> dropoff coords', () => {
    expect(legEndpoint('toDropoff', order)).toEqual({ lat: 50.1, lng: 14.5 })
  })

  it('toDropoff without a dropoff -> null', () => {
    expect(legEndpoint('toDropoff', orderNoDropoff)).toBeNull()
  })

  it('null leg -> null', () => {
    expect(legEndpoint(null, order)).toBeNull()
  })
})

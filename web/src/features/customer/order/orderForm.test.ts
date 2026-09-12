import { describe, it, expect } from 'vitest'
import {
  MIN_PASSENGERS,
  MAX_PASSENGERS,
  clampPassengers,
  isAddressLocked,
  buildRouteOrderRequest,
  buildZoneOrderRequest,
} from './orderForm'
import type { CommonRouteDto } from '../../../shared/api/client'

const p2p: CommonRouteDto = {
  id: 'r1',
  name: 'Nádraží → Centrum',
  type: 'PointToPoint',
  priceCzk: 110,
  pickupAddress: 'Nádraží → Centrum',
  pickupLat: 50.0875,
  pickupLng: 14.4213,
  dropoffAddress: 'Nádraží → Centrum',
  dropoffLat: 50.0801,
  dropoffLng: 14.4289,
}
const p2pPickupOnly: CommonRouteDto = {
  id: 'r3',
  name: 'Letiště',
  type: 'PointToPoint',
  priceCzk: 300,
  pickupAddress: 'Letiště',
  pickupLat: 50.1008,
  pickupLng: 14.26,
  dropoffAddress: null,
  dropoffLat: null,
  dropoffLng: null,
}
const zone: CommonRouteDto = { id: 'r2', name: 'Centrum', type: 'Zone', priceCzk: 90 }

describe('clampPassengers', () => {
  it('clamps below the minimum up to 1', () => {
    expect(clampPassengers(0)).toBe(MIN_PASSENGERS)
    expect(clampPassengers(-3)).toBe(1)
  })

  it('clamps above the maximum down to 4', () => {
    expect(clampPassengers(5)).toBe(MAX_PASSENGERS)
    expect(clampPassengers(99)).toBe(4)
  })

  it('passes values within 1..4 through', () => {
    expect(clampPassengers(1)).toBe(1)
    expect(clampPassengers(4)).toBe(4)
    expect(clampPassengers(2)).toBe(2)
  })
})

describe('isAddressLocked', () => {
  it('locks addresses for a PointToPoint route', () => {
    expect(isAddressLocked(p2p)).toBe(true)
  })

  it('does not lock addresses for Zone routes (customer picks pickup)', () => {
    expect(isAddressLocked(zone)).toBe(false)
  })
})

describe('buildRouteOrderRequest', () => {
  it('builds a Fixed-price request carrying the routeId and fixed price', () => {
    const req = buildRouteOrderRequest({ route: p2p, passengers: 2, scheduledAt: null, note: 'u vchodu' })
    expect(req.priceType).toBe('Fixed')
    expect(req.fixedPriceCzk).toBe(110)
    expect(req.routeId).toBe('r1')
    expect(req.passengers).toBe(2)
    expect(req.note).toBe('u vchodu')
    expect(req.scheduledAt).toBeNull()
  })

  it('sends the REAL pickup coords/address from the route (no more 0-stub)', () => {
    const req = buildRouteOrderRequest({ route: p2p, passengers: 1, scheduledAt: null, note: null })
    expect(req.pickupAddress).toBe('Nádraží → Centrum')
    expect(req.pickupLat).toBe(50.0875)
    expect(req.pickupLng).toBe(14.4213)
    // The 0-stub must be gone.
    expect(req.pickupLat).not.toBe(0)
    expect(req.pickupLng).not.toBe(0)
  })

  it('includes dropoff coords/address only when BOTH dropoff coords are present', () => {
    const req = buildRouteOrderRequest({ route: p2p, passengers: 1, scheduledAt: null, note: null })
    expect(req.dropoffAddress).toBe('Nádraží → Centrum')
    expect(req.dropoffLat).toBe(50.0801)
    expect(req.dropoffLng).toBe(14.4289)
  })

  it('omits the dropoff (address + coords) for a pickup-only PointToPoint route', () => {
    const req = buildRouteOrderRequest({ route: p2pPickupOnly, passengers: 1, scheduledAt: null, note: null })
    expect(req.pickupLat).toBe(50.1008)
    expect(req.dropoffAddress).toBeNull()
    expect(req.dropoffLat).toBeNull()
    expect(req.dropoffLng).toBeNull()
  })

  it('clamps out-of-range passenger counts into the request', () => {
    const req = buildRouteOrderRequest({ route: p2p, passengers: 9, scheduledAt: null, note: null })
    expect(req.passengers).toBe(4)
  })

  it('carries a scheduled time when provided (Na čas)', () => {
    const when = '2026-09-13T10:00:00.000Z'
    const req = buildRouteOrderRequest({ route: p2p, passengers: 1, scheduledAt: when, note: null })
    expect(req.scheduledAt).toBe(when)
  })
})

const zoneToZone: CommonRouteDto = {
  id: 'r9', name: 'Kutná Hora → Kolín', type: 'ZoneToZone', priceCzk: 300,
  fromZoneId: 'z-kh', toZoneId: 'z-kolin',
}

describe('buildZoneOrderRequest', () => {
  it('uses the customer-entered pickup coords and the server-matched routeId + locked price', () => {
    const req = buildZoneOrderRequest({
      route: zone,
      pickup: { address: 'Palackého nám. 1, Kutná Hora', lat: 49.948, lng: 15.268 },
      dropoff: null,
      passengers: 2,
      scheduledAt: null,
      note: null,
      quoteRouteId: 'r2',
      quotePriceCzk: 110,
    })
    expect(req.priceType).toBe('Fixed')
    expect(req.routeId).toBe('r2')
    expect(req.fixedPriceCzk).toBe(110)
    expect(req.pickupAddress).toBe('Palackého nám. 1, Kutná Hora')
    expect(req.pickupLat).toBe(49.948)
    expect(req.pickupLng).toBe(15.268)
    // Single-Zone order: no dropoff.
    expect(req.dropoffAddress).toBeNull()
    expect(req.dropoffLat).toBeNull()
    expect(req.passengers).toBe(2)
  })

  it('threads both endpoints for a ZoneToZone order', () => {
    const req = buildZoneOrderRequest({
      route: zoneToZone,
      pickup: { address: 'Kutná Hora', lat: 49.948, lng: 15.268 },
      dropoff: { address: 'Kolín', lat: 50.027, lng: 15.199 },
      passengers: 1,
      scheduledAt: null,
      note: 'u nádraží',
      quoteRouteId: 'r9',
      quotePriceCzk: 300,
    })
    expect(req.routeId).toBe('r9')
    expect(req.fixedPriceCzk).toBe(300)
    expect(req.dropoffAddress).toBe('Kolín')
    expect(req.dropoffLat).toBe(50.027)
    expect(req.dropoffLng).toBe(15.199)
    expect(req.note).toBe('u nádraží')
  })
})

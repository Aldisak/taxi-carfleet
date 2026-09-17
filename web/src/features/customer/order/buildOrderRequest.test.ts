import { describe, it, expect } from 'vitest'
import { buildOrderRequest, type BuildOrderRequestInput } from './buildOrderRequest'
import type { SelectedPlace } from './orderFlowState'
import type { PriceQuoteView } from '../../../shared/pricing/interpretQuote'
import { MIN_PASSENGERS, MAX_PASSENGERS } from './orderForm'

const PICKUP: SelectedPlace = { label: 'Centrum Kutná Hora', lat: 49.948, lng: 15.268 }
const DEST: SelectedPlace = { label: 'Nádražní 1, Kutná Hora', lat: 49.95, lng: 15.271 }

const FIXED_VIEW: PriceQuoteView = { kind: 'fixed', priceCzk: 240, routeId: 'route-abc' }
const ESTIMATE_VIEW: PriceQuoteView = {
  kind: 'estimate',
  lowCzk: 180,
  highCzk: 260,
  distanceKm: 6.4,
  durationMin: 12,
  degraded: false,
}
const METER_VIEW: PriceQuoteView = { kind: 'meter' }
const UNKNOWN_VIEW: PriceQuoteView = { kind: 'unknown' }

function baseInput(view: PriceQuoteView, overrides: Partial<BuildOrderRequestInput> = {}): BuildOrderRequestInput {
  return {
    view,
    pickup: PICKUP,
    destination: DEST,
    passengers: 2,
    scheduledAt: null,
    note: null,
    ...overrides,
  }
}

describe('buildOrderRequest', () => {
  it('maps a Fixed view to priceType Fixed with fixedPriceCzk + routeId and no estimatedPriceCzk', () => {
    const req = buildOrderRequest(baseInput(FIXED_VIEW))
    expect(req.priceType).toBe('Fixed')
    expect(req.fixedPriceCzk).toBe(240)
    expect(req.routeId).toBe('route-abc')
    expect(req.estimatedPriceCzk).toBeNull()
  })

  it('maps an Estimate view to priceType Estimate with estimatedPriceCzk NULL (server recomputes)', () => {
    const req = buildOrderRequest(baseInput(ESTIMATE_VIEW))
    expect(req.priceType).toBe('Estimate')
    // The estimate is a RANGE (low/high), never a point value — the server recomputes.
    expect(req.estimatedPriceCzk).toBeNull()
    expect(req.fixedPriceCzk).toBeNull()
    expect(req.routeId).toBeNull()
  })

  it('maps a Meter view to priceType Meter with no price fields', () => {
    const req = buildOrderRequest(baseInput(METER_VIEW))
    expect(req.priceType).toBe('Meter')
    expect(req.fixedPriceCzk).toBeNull()
    expect(req.estimatedPriceCzk).toBeNull()
    expect(req.routeId).toBeNull()
  })

  it('maps an unknown view to priceType Meter with no price fields (no undefined branch)', () => {
    const req = buildOrderRequest(baseInput(UNKNOWN_VIEW))
    expect(req.priceType).toBe('Meter')
    expect(req.fixedPriceCzk).toBeNull()
    expect(req.estimatedPriceCzk).toBeNull()
  })

  it('carries pickup + dropoff coordinates and addresses from the selected places', () => {
    const req = buildOrderRequest(baseInput(ESTIMATE_VIEW))
    expect(req.pickupAddress).toBe(PICKUP.label)
    expect(req.pickupLat).toBe(PICKUP.lat)
    expect(req.pickupLng).toBe(PICKUP.lng)
    expect(req.dropoffAddress).toBe(DEST.label)
    expect(req.dropoffLat).toBe(DEST.lat)
    expect(req.dropoffLng).toBe(DEST.lng)
  })

  it('clamps passengers into the 1..4 band', () => {
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { passengers: 9 })).passengers).toBe(MAX_PASSENGERS)
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { passengers: 0 })).passengers).toBe(MIN_PASSENGERS)
  })

  it('passes scheduledAt through as ISO or null', () => {
    const iso = '2026-09-20T10:00:00.000Z'
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { scheduledAt: iso })).scheduledAt).toBe(iso)
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { scheduledAt: null })).scheduledAt).toBeNull()
  })

  it('trims the note and normalises empty/whitespace to null', () => {
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { note: '  u vchodu  ' })).note).toBe('u vchodu')
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { note: '   ' })).note).toBeNull()
    expect(buildOrderRequest(baseInput(FIXED_VIEW, { note: null })).note).toBeNull()
  })
})

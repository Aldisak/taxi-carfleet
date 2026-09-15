import { describe, it, expect } from 'vitest'
import { interpretQuote, isFormSubmittable, type PriceQuoteView } from './priceQuote'
import type { PriceQuoteResponse } from '../../../shared/api/client'

describe('interpretQuote', () => {
  it('maps a Fixed quote to a single price + routeId', () => {
    const res: PriceQuoteResponse = { type: 'Fixed', priceCzk: 300, routeId: 'r7', routeName: 'KH → Kolín' }
    const view = interpretQuote(res)
    expect(view).toEqual<PriceQuoteView>({ kind: 'fixed', priceCzk: 300, routeId: 'r7' })
  })

  it('maps an Estimate quote to a low/high RANGE carrying distance/duration (Exact mode → not degraded)', () => {
    const res: PriceQuoteResponse = { type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18, estimateMode: 'Exact' }
    const view = interpretQuote(res)
    expect(view).toEqual<PriceQuoteView>({ kind: 'estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18, degraded: false })
  })

  it('flags a haversine-fallback Estimate (estimateMode="Estimated") as degraded (AC#5 orientační odhad, wider band)', () => {
    // The backend already returns the WIDER ±20% band for a degraded estimate — interpretQuote
    // must NOT recompute the width, only pass the degraded flag through so the UI labels it.
    const res: PriceQuoteResponse = { type: 'Estimate', lowCzk: 160, highCzk: 240, distanceKm: 12.4, durationMin: 18, estimateMode: 'Estimated' }
    const view = interpretQuote(res)
    expect(view).toEqual<PriceQuoteView>({ kind: 'estimate', lowCzk: 160, highCzk: 240, distanceKm: 12.4, durationMin: 18, degraded: true })
  })

  it('treats a missing estimateMode as not degraded (backward compatible)', () => {
    const res: PriceQuoteResponse = { type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 }
    const view = interpretQuote(res)
    expect(view.kind === 'estimate' && view.degraded).toBe(false)
  })

  it('NEVER collapses an estimate to a single number (AC #4): low and high stay distinct', () => {
    const res: PriceQuoteResponse = { type: 'Estimate', lowCzk: 200, highCzk: 200, distanceKm: 5, durationMin: 8 }
    const view = interpretQuote(res)
    expect(view.kind).toBe('estimate')
    if (view.kind === 'estimate') {
      // A degenerate equal band is widened so it is never shown as one exact number.
      expect(view.highCzk).toBeGreaterThan(view.lowCzk)
    }
  })

  it('maps a Meter quote to the meter view (the NEW A6 branch — was previously "unknown")', () => {
    const res: PriceQuoteResponse = { type: 'Meter', baseCzk: 40, perKmCzk: 30, minimumCzk: 60 }
    expect(interpretQuote(res)).toEqual<PriceQuoteView>({ kind: 'meter' })
  })
})

describe('isFormSubmittable', () => {
  it('is false without pickup coords', () => {
    expect(isFormSubmittable({ lat: null, lng: null, address: '' })).toBe(false)
  })

  it('is false when an address label is present but coords are missing', () => {
    expect(isFormSubmittable({ lat: null, lng: null, address: 'Hlavní 1' })).toBe(false)
  })

  it('is true once pickup coords and a label exist', () => {
    expect(isFormSubmittable({ lat: 50.08, lng: 14.42, address: 'Moje poloha (GPS)' })).toBe(true)
  })
})

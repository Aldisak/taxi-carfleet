import { describe, it, expect } from 'vitest'
import { interpretQuote, isFormSubmittable, type PriceQuoteView } from './priceQuote'
import type { PriceQuoteResponse } from '../../../shared/api/client'

describe('interpretQuote', () => {
  it('maps a Fixed quote to a single price', () => {
    const res: PriceQuoteResponse = { priceType: 'Fixed', fixedPriceCzk: 300, estimateLowCzk: null, estimateHighCzk: null }
    const view = interpretQuote(res)
    expect(view).toEqual<PriceQuoteView>({ kind: 'fixed', priceCzk: 300 })
  })

  it('maps an Estimate quote to a low/high RANGE', () => {
    const res: PriceQuoteResponse = { priceType: 'Estimate', fixedPriceCzk: null, estimateLowCzk: 180, estimateHighCzk: 220 }
    const view = interpretQuote(res)
    expect(view).toEqual<PriceQuoteView>({ kind: 'estimate', lowCzk: 180, highCzk: 220 })
  })

  it('NEVER collapses an estimate to a single number (AC #4): low and high stay distinct', () => {
    const res: PriceQuoteResponse = { priceType: 'Estimate', fixedPriceCzk: null, estimateLowCzk: 200, estimateHighCzk: 200 }
    const view = interpretQuote(res)
    expect(view.kind).toBe('estimate')
    if (view.kind === 'estimate') {
      // A degenerate equal band is widened so it is never shown as one exact number.
      expect(view.highCzk).toBeGreaterThan(view.lowCzk)
    }
  })

  it('treats a malformed Estimate (missing bounds) as unknown, never a point price', () => {
    const res: PriceQuoteResponse = { priceType: 'Estimate', fixedPriceCzk: null, estimateLowCzk: null, estimateHighCzk: null }
    expect(interpretQuote(res)).toEqual<PriceQuoteView>({ kind: 'unknown' })
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

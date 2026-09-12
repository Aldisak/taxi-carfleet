import type { PriceQuoteResponse } from '../../../shared/api/client'

/**
 * The structured interpretation of a price quote. Kept STRUCTURED (a discriminated union)
 * rather than a pre-formatted Czech string so the component composes the label via
 * useTranslation (rules/web-react-style.md#i18n-czech-first). AC #4: an estimate always
 * carries two distinct bounds — it can never be rendered as a single exact number.
 */
export type PriceQuoteView =
  | { kind: 'fixed'; priceCzk: number }
  | { kind: 'estimate'; lowCzk: number; highCzk: number }
  | { kind: 'unknown' }

/** Minimum spread (CZK) enforced so a degenerate equal band never shows one exact number (AC #4). */
const MIN_ESTIMATE_SPREAD_CZK = 20

/**
 * Interprets a GET /pricing/quote response into a structured view. Fixed → a single price;
 * Estimate → a RANGE whose high is guaranteed strictly greater than its low (AC #4); any
 * malformed shape (Estimate without bounds, unknown priceType) → 'unknown' so the UI shows
 * no price rather than a bogus exact number.
 */
export function interpretQuote(res: PriceQuoteResponse): PriceQuoteView {
  if (res.priceType === 'Fixed' && res.fixedPriceCzk != null) {
    return { kind: 'fixed', priceCzk: res.fixedPriceCzk }
  }

  if (res.priceType === 'Estimate' && res.estimateLowCzk != null && res.estimateHighCzk != null) {
    const low = res.estimateLowCzk
    // Widen a degenerate (equal) band so an estimate is NEVER a single exact number.
    const high =
      res.estimateHighCzk > low ? res.estimateHighCzk : low + MIN_ESTIMATE_SPREAD_CZK
    return { kind: 'estimate', lowCzk: low, highCzk: high }
  }

  return { kind: 'unknown' }
}

/** The pickup selection state that gates whether the custom order can be submitted. */
export interface CustomOrderPickup {
  address: string
  lat: number | null
  lng: number | null
}

/**
 * Whether the custom order form is submittable: a pickup label AND resolved pickup
 * coordinates are required (the backend CreateOrder validator rejects a null/zero pickup).
 * A typed freeform address with no coords is NOT submittable — the customer must pick a
 * suggestion, use GPS, or drag the pin to resolve coordinates.
 */
export function isFormSubmittable(pickup: CustomOrderPickup): boolean {
  return pickup.address.trim() !== '' && pickup.lat != null && pickup.lng != null
}

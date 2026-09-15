import type { PriceQuoteResponse } from '../api/client'

/**
 * The structured interpretation of a price quote. Kept STRUCTURED (a discriminated union)
 * rather than a pre-formatted Czech string so the component composes the label via
 * useTranslation (rules/web-react-style.md#i18n-czech-first). AC #4: an estimate always
 * carries two distinct bounds — it can never be rendered as a single exact number.
 *
 * Lives in shared/ (not a feature folder) because BOTH the customer order screens and the
 * dispatcher Settings "Otestovat" panel interpret a quote; a cross-feature import would
 * violate rules/web-architecture.md#feature-folders.
 */
export type PriceQuoteView =
  | { kind: 'fixed'; priceCzk: number; routeId: string }
  | { kind: 'estimate'; lowCzk: number; highCzk: number; distanceKm: number; durationMin: number; degraded: boolean }
  | { kind: 'meter' }
  | { kind: 'unknown' }

/** Minimum spread (CZK) enforced so a degenerate equal band never shows one exact number (AC #4). */
const MIN_ESTIMATE_SPREAD_CZK = 20

/**
 * Interprets a POST /pricing/quote response (discriminated on `type`, A6/UC-006) into a
 * structured view. Fixed → a single price + the matched routeId; Estimate → a RANGE whose
 * high is guaranteed strictly greater than its low (AC #4), carrying distance/duration;
 * Meter → the taximeter fallback; any malformed shape → 'unknown' so the UI shows no price
 * rather than a bogus exact number.
 *
 * When the estimate came from the haversine fallback (`estimateMode === 'Estimated'`, UC-010
 * AC#5) the view is flagged `degraded: true` so the UI shows the WIDER band under an
 * "orientační odhad" label. The width itself is NOT recomputed here — the backend already
 * returns the wider ±20% band; interpretQuote only threads the flag through.
 */
export function interpretQuote(res: PriceQuoteResponse): PriceQuoteView {
  switch (res.type) {
    case 'Fixed':
      return { kind: 'fixed', priceCzk: res.priceCzk, routeId: res.routeId }

    case 'Estimate': {
      const low = res.lowCzk
      // Widen a degenerate (equal) band so an estimate is NEVER a single exact number.
      const high = res.highCzk > low ? res.highCzk : low + MIN_ESTIMATE_SPREAD_CZK
      return {
        kind: 'estimate',
        lowCzk: low,
        highCzk: high,
        distanceKm: res.distanceKm,
        durationMin: res.durationMin,
        degraded: res.estimateMode === 'Estimated',
      }
    }

    case 'Meter':
      return { kind: 'meter' }

    default:
      return { kind: 'unknown' }
  }
}

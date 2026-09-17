import type { CreateOrderRequest, PriceType } from '../../../shared/api/client'
import type { PriceQuoteView } from '../../../shared/pricing/interpretQuote'
import type { SelectedPlace } from './orderFlowState'
import { clampPassengers } from './orderForm'

/**
 * Inputs for building a customer map-order CreateOrderRequest (UC-015 WI-1). Pure — the page
 * (WI-4) collects these from its state (the interpreted price view, the selected pickup +
 * destination, the ride options) and this module maps them to the wire contract.
 */
export interface BuildOrderRequestInput {
  /** The interpreted price quote (drives priceType + which price fields are sent). */
  view: PriceQuoteView
  /** The resolved pickup (GPS / center-pin / suggestion). */
  pickup: SelectedPlace
  /** The chosen destination, or null (dropoff omitted). */
  destination: SelectedPlace | null
  /** Requested passenger count (clamped to 1..4). */
  passengers: number
  /** Scheduled pickup as an ISO string, or null for "Hned". */
  scheduledAt: string | null
  /** Optional pickup note (trimmed; empty → null). */
  note: string | null
}

/** The price-field mapping for a given interpreted view (F2/F4). */
interface PriceFields {
  priceType: PriceType
  fixedPriceCzk: number | null
  estimatedPriceCzk: number | null
  routeId: string | null
}

/**
 * Maps the interpreted price view to the wire price fields (F2/F4).
 * - `fixed`   → priceType Fixed, carrying the exact price + matched routeId.
 * - `estimate`→ priceType Estimate, estimatedPriceCzk NULL. The estimate is a RANGE
 *               (low/high), never a point value — the server recomputes the price, matching
 *               the proven CustomOrderPage contract. We never fabricate a point price.
 * - `meter` / `unknown` → priceType Meter, no price fields. Both are handled explicitly so
 *               there is no undefined-behaviour branch (F4); WI-3's UI disables Order for
 *               these so this path is not exercised in practice.
 */
function priceFieldsFor(view: PriceQuoteView): PriceFields {
  switch (view.kind) {
    case 'fixed':
      return { priceType: 'Fixed', fixedPriceCzk: view.priceCzk, estimatedPriceCzk: null, routeId: view.routeId }
    case 'estimate':
      return { priceType: 'Estimate', fixedPriceCzk: null, estimatedPriceCzk: null, routeId: null }
    case 'meter':
    case 'unknown':
      return { priceType: 'Meter', fixedPriceCzk: null, estimatedPriceCzk: null, routeId: null }
  }
}

/**
 * Builds the CreateOrderRequest for a customer map-order. Supersedes the hardcoded-`Estimate`
 * path in the old CustomOrderPage: the priceType now follows the interpreted quote (Fixed
 * carries the exact price + routeId; Estimate carries a null estimatedPriceCzk so the server
 * recomputes). Pure — no network, no i18n.
 */
export function buildOrderRequest(input: BuildOrderRequestInput): CreateOrderRequest {
  const { view, pickup, destination, passengers, scheduledAt, note } = input
  const price = priceFieldsFor(view)
  const trimmedNote = note?.trim()

  return {
    pickupAddress: pickup.label,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffAddress: destination ? destination.label : null,
    dropoffLat: destination ? destination.lat : null,
    dropoffLng: destination ? destination.lng : null,
    scheduledAt,
    note: trimmedNote ? trimmedNote : null,
    passengers: clampPassengers(passengers),
    priceType: price.priceType,
    fixedPriceCzk: price.fixedPriceCzk,
    estimatedPriceCzk: price.estimatedPriceCzk,
    routeId: price.routeId,
  }
}

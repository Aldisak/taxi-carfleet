// interpretQuote + PriceQuoteView were promoted to src/shared/pricing so the dispatcher
// Settings "Otestovat" panel can reuse them without a cross-feature import
// (rules/web-architecture.md#feature-folders). Re-exported here so existing customer imports
// keep working unchanged.
export { interpretQuote, type PriceQuoteView } from '../../../shared/pricing/interpretQuote'

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

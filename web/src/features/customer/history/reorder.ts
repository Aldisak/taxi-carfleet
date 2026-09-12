import type { MyOrderHistoryItemDto } from '../../../shared/api/client'

/**
 * Prefill payload handed to the Custom order screen via router state when the customer taps
 * "Objednat znovu". Only the addresses are copied (a past order carries no fresh coordinates in
 * the history list projection); the customer re-confirms pickup on the map/autocomplete, which
 * supplies the coords. Matches the AddressValue.address shape the custom-order form consumes.
 */
export interface ReorderDraft {
  pickupAddress: string
  dropoffAddress: string | null
}

/** Router-state key under which the custom-order screen reads a reorder prefill. */
export const REORDER_STATE_KEY = 'reorder'

/**
 * Builds the custom-order prefill draft from a past order row (pure). Copies the pickup and
 * dropoff addresses; the custom-order form re-resolves coordinates on confirm.
 */
export function buildReorderDraft(order: Pick<MyOrderHistoryItemDto, 'pickupAddress' | 'dropoffAddress'>): ReorderDraft {
  return {
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress ?? null,
  }
}

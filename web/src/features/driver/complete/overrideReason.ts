import type { CompleteOrderRequest } from '../../../shared/api/client'

/** Minimum length of a price-override reason (server-enforced). */
export const MIN_OVERRIDE_REASON_LENGTH = 5

/**
 * Pure function: true when the typed override reason is long enough (>= 5 chars, trimmed).
 */
export function isOverrideReasonValid(reason: string): boolean {
  return reason.trim().length >= MIN_OVERRIDE_REASON_LENGTH
}

/**
 * Pure function: decides whether an overrideReason must be sent on complete.
 * Only for a Fixed-price order whose final price actually differs from the fixed price.
 *
 * @param priceType      Order price type ('Fixed' | 'Estimate' | 'Meter')
 * @param fixedPriceCzk  The locked fixed price (or null)
 * @param finalPriceCzk  The final price the driver is submitting
 */
export function priceWasChanged(
  priceType: string,
  fixedPriceCzk: number | null,
  finalPriceCzk: number,
): boolean {
  if (priceType !== 'Fixed') return false
  if (fixedPriceCzk == null) return false
  return Math.floor(finalPriceCzk) !== Math.floor(fixedPriceCzk)
}

/** Input data for building the complete order API payload. */
export interface CompletePayloadInput {
  finalPriceCzk: number
  paymentType: string
  overrideRevealed: boolean
  overrideReason: string
  priceType: string
  fixedPriceCzk: number | null
}

/**
 * Pure function: builds the CompleteOrderRequest payload from form state.
 * - Floors finalPriceCzk to an integer (server expects int CZK).
 * - Includes overrideReason ONLY when a Fixed price was actually changed (and revealed).
 *
 * @param input  Form data collected from the complete ride screen
 */
export function buildCompletePayload(input: CompletePayloadInput): CompleteOrderRequest {
  const payload: CompleteOrderRequest = {
    finalPriceCzk: Math.floor(input.finalPriceCzk),
    paymentType: input.paymentType,
  }

  if (
    input.overrideRevealed &&
    priceWasChanged(input.priceType, input.fixedPriceCzk, input.finalPriceCzk) &&
    input.overrideReason.trim()
  ) {
    payload.overrideReason = input.overrideReason.trim()
  }

  return payload
}

/**
 * Derived UI state for the complete ride form.
 */
export interface CompleteFormState {
  /** True when price is locked (Fixed priceType, override not yet revealed). */
  priceLocked: boolean
  /** Amount to prefill the price input with. Null for Meter. */
  prefillAmount: number | null
  /** True when the "Změnit cenu" override reveal button should be shown. */
  showOverrideReveal: boolean
}

/**
 * Input data for the complete form validation.
 */
export interface CompleteFormInput {
  priceType: string
  fixedPriceCzk: number | null
  finalPriceCzk: number | null
  paymentType: string | null
  overrideRevealed: boolean
  overrideReason: string
}

/**
 * Validation error messages keyed by field name.
 * Empty object means no errors.
 */
export type CompleteFormErrors = Partial<Record<'finalPriceCzk' | 'paymentType' | 'overrideReason', string>>

/**
 * Pure function: derives the form UI state from order price data.
 *
 * @param priceType           Order price type: 'Fixed' | 'Estimate' | 'Meter'
 * @param fixedPriceCzk       Fixed price in CZK (or null)
 * @param estimatedPriceCzk   Estimated price in CZK (or null)
 */
export function deriveCompleteFormState(
  priceType: string,
  fixedPriceCzk: number | null,
  estimatedPriceCzk: number | null,
): CompleteFormState {
  switch (priceType) {
    case 'Fixed':
      return {
        priceLocked: true,
        prefillAmount: fixedPriceCzk,
        showOverrideReveal: true,
      }

    case 'Estimate':
      return {
        priceLocked: false,
        prefillAmount: estimatedPriceCzk,
        showOverrideReveal: false,
      }

    case 'Meter':
    default:
      return {
        priceLocked: false,
        prefillAmount: null,
        showOverrideReveal: false,
      }
  }
}

/**
 * Pure function: validates the complete form data.
 * Returns an empty object when valid.
 */
export function validateCompleteForm(input: CompleteFormInput): CompleteFormErrors {
  const errors: CompleteFormErrors = {}

  if (input.finalPriceCzk == null || input.finalPriceCzk <= 0) {
    errors.finalPriceCzk = 'driver.complete.errors.priceRequired'
  }

  if (!input.paymentType) {
    errors.paymentType = 'driver.complete.errors.paymentRequired'
  }

  // Override reason required when Fixed price was changed via the override reveal.
  // Trim before the length check so whitespace-only reasons (which overrideReason.ts drops
  // from the payload) are also rejected client-side — B3c-2.
  if (input.overrideRevealed && input.priceType === 'Fixed' && input.overrideReason.trim().length < 5) {
    errors.overrideReason = 'driver.complete.errors.overrideReasonTooShort'
  }

  return errors
}

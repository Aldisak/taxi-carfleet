/** Visual variant of the price badge. */
export type PriceBadgeVariant = 'green' | 'grey'

/** Derived display data for the offer price badge. */
export interface PriceBadgeResult {
  /** i18n key for the badge label. */
  label: string
  /** Color variant: green for fixed, grey for estimate/meter. */
  variant: PriceBadgeVariant
  /** Numeric amount in CZK, or null for meter pricing. */
  amount: number | null
}

/**
 * Pure function: maps backend priceType + amounts to display data.
 * No side effects.
 * @param priceType    'Fixed' | 'Estimate' | 'Meter'
 * @param fixedPriceCzk  Set when priceType is Fixed.
 * @param estimatedPriceCzk  Set when priceType is Estimate.
 */
export function derivePriceBadge(
  priceType: string,
  fixedPriceCzk: number | null,
  estimatedPriceCzk: number | null,
): PriceBadgeResult {
  switch (priceType) {
    case 'Fixed':
      return {
        label: 'driver.offer.priceFixed',
        variant: 'green',
        amount: fixedPriceCzk,
      }

    case 'Estimate':
      return {
        label: 'driver.offer.priceEstimate',
        variant: 'grey',
        amount: estimatedPriceCzk,
      }

    case 'Meter':
      return {
        label: 'driver.offer.priceMeter',
        variant: 'grey',
        amount: null,
      }

    default:
      return {
        label: 'driver.offer.priceMeter',
        variant: 'grey',
        amount: null,
      }
  }
}

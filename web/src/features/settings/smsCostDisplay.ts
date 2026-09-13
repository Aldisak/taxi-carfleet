/**
 * Pure SMS cost/cap display logic for the dispatcher Settings (UC-005 B2, assignment 05 §4).
 *
 * The dispatcher sees, read-only, the current-month SMS count, the estimated cost
 * (count * unit cost), and a warning when near/over the monthly cap. Keeping the decision pure
 * lets FleetTab stay presentational (rules/web-architecture.md#pure-logic-modules).
 */

/** Cap proximity level — drives the i18n warning key + tone in the view. */
export type CapLevel = 'ok' | 'near' | 'over'

/** The rendered SMS-cost display model. */
export interface SmsCostDisplay {
  count: number
  estimatedCostCzk: number
  capCzk: number
  level: CapLevel
}

/** Threshold (fraction of the cap) at which a "near cap" warning is shown (assignment 05 §4: 90%). */
export const NEAR_CAP_FRACTION = 0.9

/**
 * Compute the SMS cost display. `estimatedCostCzk = count * unitCostCzk`. The level is `over`
 * once the estimated cost reaches the cap, `near` at ≥90% of the cap, else `ok`. A non-positive
 * cap degrades to `ok` (cap disabled) so the UI never divides by zero or warns spuriously.
 */
export function computeSmsCostDisplay(
  count: number,
  unitCostCzk: number,
  capCzk: number,
): SmsCostDisplay {
  const estimatedCostCzk = count * unitCostCzk
  let level: CapLevel = 'ok'
  if (capCzk > 0) {
    if (estimatedCostCzk >= capCzk) level = 'over'
    else if (estimatedCostCzk >= capCzk * NEAR_CAP_FRACTION) level = 'near'
  }
  return { count, estimatedCostCzk, capCzk, level }
}

/** Format an integer CZK amount for display (cs-CZ, no decimals — money is integer CZK). */
export function formatCzk(amountCzk: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amountCzk)
}

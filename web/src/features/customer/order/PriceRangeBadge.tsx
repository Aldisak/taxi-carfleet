import { useTranslation } from 'react-i18next'
import { Callout } from '../../../shared/ui/Callout'
import { PriceCard } from '../../../shared/ui/PriceCard'
import { Icon } from '../../../shared/ui/icons/Icon'
import { formatCzk } from '../../../shared/format/money'
import type { PriceQuoteView } from './priceQuote'

/** Props for PriceRangeBadge. */
export interface PriceRangeBadgeProps {
  /** The interpreted quote, or null when no quote is available yet. */
  view: PriceQuoteView | null
  /** i18n key for a quote failure (502), or null/absent. */
  errorKey?: string | null
}

/**
 * Renders the customer price preview on the UI-kit PriceCard (UC-020 WI-2 restyle).
 *
 * - Fixed   → the exact price at display size + the existing "Cena {price} – pevná" label as the
 *             card note (the "pevná" wording is preserved for AT parity; there is no standalone
 *             "pevná cena" i18n key — see the WI-2 reported gaps).
 * - Estimate→ a RANGE "low Kč – high Kč" (AC #4, never a single exact value) at display size, with
 *             the existing "Odhad …"/"Orientační odhad …" label as the note; degraded estimates get
 *             the warning tone.
 * - Meter   → a neutral non-orderable card ("Podle taximetru").
 * - Error   → a danger Callout.
 *
 * role="status" is preserved so the pre-restyle live-region announcement is unchanged, and the
 * numeric price text is untouched so existing content assertions + the e2e price-visibility check
 * survive. The pure priceQuote.ts stays structured; all Czech labels are composed here.
 */
export function PriceRangeBadge({ view, errorKey = null }: PriceRangeBadgeProps) {
  const { t } = useTranslation()

  if (errorKey) {
    return (
      <Callout tone="danger" role="status" icon={<Icon name="close" />}>
        {t(errorKey)}
      </Callout>
    )
  }

  if (!view || view.kind === 'unknown') {
    return null
  }

  if (view.kind === 'fixed') {
    // The whole label goes in the display line (a single node) so the price number appears exactly
    // once — the Kit has no numberless "Pevná cena" Pill key (see WI-2 reported gaps).
    return (
      <div role="status">
        <PriceCard price={t('customer.custom.quoteFixed', { price: formatCzk(view.priceCzk) })} />
      </div>
    )
  }

  if (view.kind === 'meter') {
    return (
      <div role="status">
        <PriceCard price={t('customer.custom.quoteMeter')} />
      </div>
    )
  }

  // A degraded (haversine-fallback) estimate shows the WIDER band under an "orientační odhad"
  // label in a warning-toned card (UC-010 AC#5); an exact estimate keeps the neutral "Odhad" label.
  // The whole label (incl. the range) is one display node so each number appears exactly once.
  const low = formatCzk(view.lowCzk)
  const high = formatCzk(view.highCzk)
  const labelKey = view.degraded ? 'customer.custom.quoteEstimateOrientacni' : 'customer.custom.quoteEstimate'

  return (
    <div role="status">
      <PriceCard price={t(labelKey, { low, high })} tone={view.degraded ? 'warning' : 'neutral'} />
    </div>
  )
}

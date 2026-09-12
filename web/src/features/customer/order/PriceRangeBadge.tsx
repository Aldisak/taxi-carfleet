import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { formatCzk } from '../../../shared/format/money'
import type { PriceQuoteView } from './priceQuote'

const Badge = styled.p<{ $fixed: boolean }>`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme, $fixed }) => ($fixed ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $fixed }) => ($fixed ? '#ffffff' : theme.colors.text)};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  text-align: center;
`

const Error = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  text-align: center;
`

/** Props for PriceRangeBadge. */
export interface PriceRangeBadgeProps {
  /** The interpreted quote, or null when no quote is available yet. */
  view: PriceQuoteView | null
  /** i18n key for a quote failure (502), or null/absent. */
  errorKey?: string | null
}

/**
 * Renders the custom-order price preview. A Fixed quote shows "Cena {n} Kč – pevná"; an
 * Estimate shows a RANGE "Odhad {low} Kč – {high} Kč" (AC #4 — never a single exact
 * estimate). A quote failure (502) shows "Cenu nelze spočítat, zavolejte nám". The Czech
 * label is composed via useTranslation (the pure priceQuote.ts stays structured).
 */
export function PriceRangeBadge({ view, errorKey = null }: PriceRangeBadgeProps) {
  const { t } = useTranslation()

  if (errorKey) {
    return <Error role="status">{t(errorKey)}</Error>
  }

  if (!view || view.kind === 'unknown') {
    return null
  }

  if (view.kind === 'fixed') {
    return <Badge $fixed role="status">{t('customer.custom.quoteFixed', { price: formatCzk(view.priceCzk) })}</Badge>
  }

  return (
    <Badge $fixed={false} role="status">
      {t('customer.custom.quoteEstimate', { low: formatCzk(view.lowCzk), high: formatCzk(view.highCzk) })}
    </Badge>
  )
}

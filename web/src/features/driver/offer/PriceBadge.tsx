import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { derivePriceBadge } from './priceBadgeUtils'

interface BadgeProps {
  $variant: 'green' | 'grey'
}

const Badge = styled.span<BadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  background: ${({ $variant, theme }) =>
    $variant === 'green' ? theme.colors.success : theme.colors.textSecondary};
  color: #ffffff;
`

interface PriceBadgeProps {
  priceType: string
  fixedPriceCzk: number | null
  estimatedPriceCzk: number | null
}

/** Visual badge showing price type (PEVNÁ / Odhad / Taxametr) with amount. */
export function PriceBadge({ priceType, fixedPriceCzk, estimatedPriceCzk }: PriceBadgeProps) {
  const { t } = useTranslation()
  const badge = derivePriceBadge(priceType, fixedPriceCzk, estimatedPriceCzk)

  return (
    <Badge $variant={badge.variant}>
      {t(badge.label)}
      {badge.amount != null && ` · ${t('driver.offer.priceCzk', { amount: badge.amount })}`}
    </Badge>
  )
}

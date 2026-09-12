import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { formatCzk } from '../../../shared/format/money'

const Badge = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  text-align: center;
`

/** Props for FixedPriceBadge. */
export interface FixedPriceBadgeProps {
  priceCzk: number
}

/**
 * The big, fixed price shown before ordering (spec §2: "Cena 110 Kč – pevná").
 * Money is integer CZK formatted at render (rules/web-react-style.md#dates-and-money).
 */
export function FixedPriceBadge({ priceCzk }: FixedPriceBadgeProps) {
  const { t } = useTranslation()
  return <Badge>{t('customer.order.fixedPrice', { price: formatCzk(priceCzk) })}</Badge>
}

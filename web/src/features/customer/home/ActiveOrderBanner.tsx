import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MyActiveOrderDto } from '../../../shared/api/client'

const Banner = styled(Link)`
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  text-decoration: none;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

/** Props for ActiveOrderBanner. */
export interface ActiveOrderBannerProps {
  activeOrder: MyActiveOrderDto
}

/**
 * Sticky banner that replaces the Home routes block when the customer has an active
 * order (spec §1). Links to the tracking screen for that order's public code.
 */
export function ActiveOrderBanner({ activeOrder }: ActiveOrderBannerProps) {
  const { t } = useTranslation()

  return (
    <Banner
      to={`/customer/t/${activeOrder.publicCode}`}
      aria-label={t('customer.home.activeOrderAria', { code: activeOrder.publicCode })}
    >
      {t('customer.home.activeOrderTitle', { code: activeOrder.publicCode })}
    </Banner>
  )
}

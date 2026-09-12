import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OfflineGate } from '../shell/OfflineGate'
import { useFleetBranding } from '../shell/useFleetBranding'
import { useCommonRoutes } from './useCommonRoutes'
import { useMyActiveOrder } from './useMyActiveOrder'
import { decideHomeContent } from './homeContent'
import { RouteCard } from './RouteCard'
import { ActiveOrderBanner } from './ActiveOrderBanner'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const SectionTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const CustomAddressButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

/**
 * Customer PWA home (/c). Renders the active-order sticky banner OR the valid-now
 * common-route cards (decided by homeContent.ts) and the always-present "Vlastní adresa"
 * button. Ordering entry points are wrapped by the OfflineGate so offline shows cached
 * reads + Zavolat. Must NOT import Leaflet (slow-3G budget, spec §Behavior rules).
 */
export function CustomerHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { fleet } = useFleetBranding()
  const { routes } = useCommonRoutes()
  const { activeOrder } = useMyActiveOrder()

  const content = decideHomeContent({ activeOrder, routes })

  return (
    <Page>
      {content.mode === 'activeOrder' && <ActiveOrderBanner activeOrder={content.activeOrder} />}

      <OfflineGate phone={fleet?.phone}>
        {content.mode === 'routes' && (
          <Section>
            <SectionTitle>{t('customer.home.commonRoutesTitle')}</SectionTitle>
            {content.routes.map(route => (
              <RouteCard key={route.id} route={route} />
            ))}
          </Section>
        )}

        <CustomAddressButton type="button" onClick={() => navigate('/c/order/new')}>
          {t('customer.home.customAddress')}
        </CustomAddressButton>
      </OfflineGate>
    </Page>
  )
}

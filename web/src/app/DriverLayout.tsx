import { useEffect } from 'react'
import styled from 'styled-components'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../shared/api/auth-storage'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../shared/api/refresh'
import { useFleetHub } from '../shared/realtime/useFleetHub'
import { useOfferListener } from '../features/driver/offer/useOfferListener'
import { useOfferStore } from '../features/driver/offer/useOfferStore'
import { OfferCard } from '../features/driver/offer/OfferCard'
import { useActiveOrderStore } from '../features/driver/ride/useActiveOrderStore'
import { DriverPositionReporter } from '../features/driver/position/DriverPositionReporter'
import { DriverQueueBar } from '../features/driver/queue/DriverQueueBar'

/**
 * Mobile-first shell for the /d driver PWA route group.
 * Minimum viewport: 360px wide, portrait orientation.
 *
 * Hosts the session-wide SignalR hub singleton and the order-offer listener +
 * takeover (hoisted from DriverHomePage in B-ride, D12): the hub must stay alive
 * while the driver is on the ride/complete screens, and an offer can arrive on any
 * /d sub-route. Touch targets: min 48px per theme.touchTargets.min.
 */
const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  min-width: 360px;
  background: ${({ theme }) => theme.colors.background};
  /* Portrait orientation hint — page does not lock orientation via JS */
  overflow-x: hidden;
`

const Content = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  /* position:relative so the map-first screen can absolute-fill this region and get a definite
     size (rather than a collapsing height:100% chain). overflow:hidden keeps the map clipped to
     the content region so it never paints over the in-flow BottomNav (UC-019 WI-5 layout fix). */
  position: relative;
  overflow: hidden;
`

const BottomNav = styled.nav`
  display: flex;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
`

const NavItem = styled(NavLink)`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};

  &.active {
    color: ${({ theme }) => theme.colors.primary};
  }
`

/** Authenticated driver app shell — renders page content via Outlet. */
export function DriverLayout() {
  const { t } = useTranslation()
  // Session-wide hub + offer wiring (single connection, survives sub-route changes).
  useFleetHub()
  useOfferListener()

  const offer = useOfferStore(s => s.offer)
  const clearOffer = useOfferStore(s => s.clearOffer)
  // Hide the BottomNav during an active ride so the ride BottomSheet (position:fixed bottom:0)
  // owns the bottom edge without colliding (mirrors the customer app). ATOMIC selector
  // (CLAUDE.md laneB3c zustand-object-selector loop trap).
  const activeOrder = useActiveOrderStore(s => s.order)

  // Boot: opt the driver session into silent refresh so the 401-retry pipeline and proactive
  // timer are active even after a page reload (module state is reset on every load).
  useEffect(() => {
    enableSilentRefresh('/driver/login')

    const token = authStorage.getAccessToken()
    if (token) {
      scheduleProactiveRefresh(token)
    }
    // Run once on mount only — no deps to watch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Shell>
      {/* Offer box stays SESSION-WIDE here (UC-019 Assumption 1): an offer arriving on
          /driver/history still shows Accept/Decline. Restyled from the full-screen takeover
          into a top-anchored region card (WI-2). */}
      {offer && (
        <OfferCard
          dto={offer.dto}
          expiresAt={offer.expiresAt}
          onDismiss={clearOffer}
        />
      )}
      <DriverPositionReporter />
      <DriverQueueBar />
      <Content>
        <Outlet />
      </Content>
      {activeOrder == null && (
        <BottomNav aria-label={t('driver.nav.label')}>
          <NavItem to="/driver" end>{t('driver.nav.home')}</NavItem>
          <NavItem to="/driver/history">{t('driver.nav.history')}</NavItem>
          <NavItem to="/driver/settings">{t('driver.nav.settings')}</NavItem>
        </BottomNav>
      )}
    </Shell>
  )
}

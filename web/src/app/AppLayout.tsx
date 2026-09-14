import styled from 'styled-components'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../shared/api/auth-storage'
import { canAccessSettings } from '../features/settings/roleGating'
import { useFleetHub } from '../shared/realtime/useFleetHub'
import { DisconnectBanner } from '../features/board/DisconnectBanner'
import { useNotificationSound } from '../shared/sound/useNotificationSound'

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: ${({ theme }) => theme.breakpoints.desktop};
  background: ${({ theme }) => theme.colors.background};
`

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  height: 52px;
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  flex-shrink: 0;
`

const FleetName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Nav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-left: auto;
`

const NavLink = styled(Link)`
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const NavButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const Content = styled.main`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`

/** The authenticated app shell — mounts SignalR hub and renders nav + content. */
export function AppLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isMuted, toggleMute] = useNotificationSound()
  const userRole = authStorage.getUserRole()
  const isFleetAdmin = canAccessSettings(userRole)

  // Start the SignalR hub connection for the duration of the authenticated session.
  useFleetHub()

  function handleLogout() {
    authStorage.clear()
    navigate('/dispatcher/login')
  }

  return (
    <Shell>
      <Header>
        <FleetName>{t('app.title')}</FleetName>
        <Nav>
          <NavLink to="/dispatcher">{t('nav.board')}</NavLink>
          <NavLink to="/dispatcher/orders">{t('nav.orders')}</NavLink>
          {isFleetAdmin && <NavLink to="/dispatcher/reports">{t('nav.reports')}</NavLink>}
          {isFleetAdmin && <NavLink to="/dispatcher/audit">{t('nav.audit')}</NavLink>}
          {isFleetAdmin && <NavLink to="/dispatcher/analytics">{t('nav.analytics')}</NavLink>}
          {isFleetAdmin && <NavLink to="/dispatcher/settings">{t('nav.settings')}</NavLink>}
          <NavButton
            type="button"
            aria-label={isMuted ? t('nav.unmute') : t('nav.mute')}
            aria-pressed={isMuted}
            onClick={toggleMute}
            data-testid="mute-toggle"
          >
            {isMuted ? '🔇' : '🔔'}
          </NavButton>
          <NavButton type="button" onClick={handleLogout}>
            {t('nav.logout')}
          </NavButton>
        </Nav>
      </Header>
      <DisconnectBanner />
      <Content>
        <Outlet />
      </Content>
    </Shell>
  )
}

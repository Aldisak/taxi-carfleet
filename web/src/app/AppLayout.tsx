import styled from 'styled-components'
import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../shared/api/auth-storage'
import { canAccessSettings } from '../features/settings/roleGating'
import { useFleetHub, useHubConnectionState } from '../shared/realtime/useFleetHub'
import { DisconnectBanner } from '../features/board/DisconnectBanner'
import { useNotificationSound } from '../shared/sound/useNotificationSound'
import { useThemeMode } from '../shared/theme/useThemeMode'
import { AppHeader, type HeaderNavItem } from './AppHeader'
import { useFleetHeader } from './useFleetHeader'

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: ${({ theme }) => theme.breakpoints.desktop};
  background: ${({ theme }) => theme.colors.background};
`

const Content = styled.main`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`

/** The authenticated app shell — mounts SignalR hub and renders the desk header + content. */
export function AppLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isMuted, toggleMute] = useNotificationSound()
  const { resolved, setMode } = useThemeMode()
  const userRole = authStorage.getUserRole()
  const isFleetAdmin = canAccessSettings(userRole)
  const fleet = useFleetHeader()

  const roleLabel =
    userRole === 'FleetAdmin'
      ? t('appLayout.roleAdmin')
      : userRole === 'SuperAdmin'
        ? t('appLayout.roleSuperAdmin')
        : userRole
          ? t('appLayout.roleDispatcher')
          : undefined

  // Start the SignalR hub connection for the duration of the authenticated session.
  useFleetHub()
  const connection = useHubConnectionState()

  const navItems: HeaderNavItem[] = [
    { to: '/dispatcher', label: t('nav.board') },
    { to: '/dispatcher/orders', label: t('nav.orders') },
    ...(isFleetAdmin
      ? [
          { to: '/dispatcher/reports', label: t('nav.reports') },
          { to: '/dispatcher/audit', label: t('nav.audit') },
          { to: '/dispatcher/analytics', label: t('nav.analytics') },
          { to: '/dispatcher/settings', label: t('nav.settings') },
        ]
      : []),
  ]

  function handleLogout() {
    authStorage.clear()
    navigate('/dispatcher/login')
  }

  function toggleTheme() {
    setMode(resolved === 'light' ? 'dark' : 'light')
  }

  return (
    <Shell>
      <AppHeader
        navItems={navItems}
        brand={{ name: fleet.name, colorHex: fleet.colorHex }}
        connection={connection}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        resolvedTheme={resolved}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        roleLabel={roleLabel}
      />
      <DisconnectBanner />
      <Content>
        <Outlet />
      </Content>
    </Shell>
  )
}

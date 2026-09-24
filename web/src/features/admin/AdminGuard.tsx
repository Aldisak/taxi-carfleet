import type { ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../shared/api/auth-storage'
import { useThemeMode } from '../../shared/theme/useThemeMode'
import { AppHeader, type HeaderNavItem } from '../../app/AppHeader'
import { canAccessAdmin } from './adminRoleGating'

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
`

const Content = styled.main`
  flex: 1;
  min-height: 0;
`

/**
 * SuperAdmin route guard + unbranded desk shell for /admin. Reads the persisted role and, for
 * anyone other than a SuperAdmin (including logged-out), redirects to the DEDICATED /admin/login
 * (UC-007 A7b) — never the fleet-scoped /dispatcher/login, which structurally cannot authenticate
 * a fleetless SuperAdmin. A dedicated login route also means a successful login navigates to /admin
 * and re-mounts this guard, which then re-reads the freshly-stored SuperAdmin role. SuperAdmin is
 * fleetless, so /admin lives outside the fleet-scoped AppLayout and reuses {@link AppHeader} in its
 * `unbranded` mode: ink dot, no fleet-hub connection pill or sound mute (admin has no hub), keeping
 * only language + theme toggle + logout.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolved, setMode } = useThemeMode()
  const role = authStorage.getUserRole()

  if (!canAccessAdmin(role)) {
    return <Navigate to="/admin/login" replace />
  }

  const navItems: HeaderNavItem[] = [
    { to: '/admin', label: t('admin.nav.fleets') },
    { to: '/admin/platform', label: t('admin.nav.platform') },
  ]

  function handleLogout() {
    authStorage.clear()
    navigate('/admin/login')
  }

  function toggleTheme() {
    setMode(resolved === 'light' ? 'dark' : 'light')
  }

  return (
    <Shell>
      <AppHeader
        unbranded
        navItems={navItems}
        brand={{ name: t('admin.shell.brand'), colorHex: null }}
        roleLabel={t('admin.shell.roleLabel')}
        resolvedTheme={resolved}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      />
      <Content>{children}</Content>
    </Shell>
  )
}

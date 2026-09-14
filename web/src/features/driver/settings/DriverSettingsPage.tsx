import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'
import { transitionQueue } from '../queue/transitionQueue'
import { idbRideStore } from '../ride/idbRideStore'
import { useDriverSettings } from './useDriverSettings'
import { NavAppPreference } from './NavAppPreference'
import { SilentModeToggle } from './SilentModeToggle'
import { Diagnostika } from './Diagnostika'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  gap: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
`

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const VersionRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
`

const LogoutButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.primary};
  border: 2px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;
`

/**
 * Driver settings screen (spec §7): nav-app preference, silent mode, app version,
 * Diagnostika panel, and logout.
 *
 * Logout clears ALL session state — localStorage tokens, the IndexedDB refresh-token
 * store, the offline transition queue, and the persisted active-ride store — then routes
 * to /driver/login (outside the /d layout, so the position reporter + queue bar unmount cleanly).
 * Preference keys (nav app, silent mode) are intentionally left untouched.
 */
export function DriverSettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { silentMode, setSilentMode, navApp, setNavApp } = useDriverSettings()

  async function handleLogout(): Promise<void> {
    authStorage.clear()
    await idbAuthStore.clear()
    await transitionQueue.clear()
    await idbRideStore.clear()
    navigate('/driver/login')
  }

  return (
    <Page>
      <Heading>{t('driver.settings.title')}</Heading>

      <NavAppPreference value={navApp} onChange={setNavApp} />
      <SilentModeToggle value={silentMode} onChange={setSilentMode} />
      <Diagnostika />

      <VersionRow>
        <span>{t('driver.settings.versionLabel')}</span>
        <span>{__APP_VERSION__}</span>
      </VersionRow>

      <LogoutButton type="button" onClick={() => void handleLogout()}>
        {t('driver.settings.logout')}
      </LogoutButton>
    </Page>
  )
}

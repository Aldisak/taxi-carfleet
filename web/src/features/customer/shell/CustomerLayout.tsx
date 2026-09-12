import { useEffect, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../../../shared/api/refresh'
import { CallButton } from './CallButton'
import { useFleetBranding } from './useFleetBranding'
import { ensureFleetSlug } from './ensureFleetSlug'

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  min-width: 320px;
  background: ${({ theme }) => theme.colors.background};
  overflow-x: hidden;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const FleetName = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Content = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
`

/**
 * Shell for the /c customer PWA route group.
 *
 * F-05: resolves the fleet slug from the URL and persists it to authStorage
 * synchronously during the first render (a useState initializer runs before any
 * child query's fetch effect), so the logged-out GET public/fleet call carries
 * X-Fleet-Slug and does not 404 on localhost. authStorage.clear() wipes the slug,
 * so it is re-resolved on every mount. Resolution order: subdomain → ?fleet= →
 * /c/f/{slug} → 'demo' (see resolveFleetSlug).
 *
 * Applies fleet branding as a nested styled-components theme override and keeps the
 * Zavolat button in the header on every /c screen. Re-enables customer silent refresh
 * on mount so a reload keeps the refresh pipeline alive (mirrors DriverLayout).
 */
export function CustomerLayout() {
  const { t } = useTranslation()

  // Persist the resolved slug synchronously, before useFleetBranding's query fetches
  // (a useState initializer runs during render, ahead of any child's fetch effect).
  useState(ensureFleetSlug)

  const { theme: brandedTheme, fleet } = useFleetBranding()

  useEffect(() => {
    enableSilentRefresh('/c/login')
    const token = authStorage.getAccessToken()
    if (token) {
      scheduleProactiveRefresh(token)
    }
    // Run once on mount — module state resets on every page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ThemeProvider theme={brandedTheme}>
      <Shell>
        <Header>
          <FleetName>{fleet?.name ?? t('customer.appName')}</FleetName>
          <CallButton phone={fleet?.phone} />
        </Header>
        <Content>
          <Outlet />
        </Content>
      </Shell>
    </ThemeProvider>
  )
}

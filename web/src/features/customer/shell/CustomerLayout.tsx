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

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`

const Logo = styled.img`
  height: 32px;
  max-width: 120px;
  object-fit: contain;
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

const Footer = styled.footer`
  padding: ${({ theme }) => theme.spacing.md};
  text-align: center;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const FooterLink = styled.a`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

/**
 * Shell for the /c customer PWA route group.
 *
 * F-05: resolves the fleet slug from the URL and persists it to authStorage
 * synchronously during the first render (a useState initializer runs before any
 * child query's fetch effect), so the logged-out GET public/fleet call carries
 * X-Fleet-Slug and does not 404 on localhost. authStorage.clear() wipes the slug,
 * so it is re-resolved on every mount. Resolution order: subdomain → ?fleet= →
 * /customer/f/{slug} → 'demo' (see resolveFleetSlug).
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
    enableSilentRefresh('/customer/login')
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
          <Brand>
            {fleet?.logoUrl && (
              <Logo src={fleet.logoUrl} alt={fleet.name ?? t('customer.appName')} />
            )}
            <FleetName>{fleet?.name ?? t('customer.appName')}</FleetName>
          </Brand>
          <CallButton phone={fleet?.phone} />
        </Header>
        <Content>
          <Outlet />
        </Content>
        <Footer>
          <FooterLink href="/gdpr.md" target="_blank" rel="noopener noreferrer">
            {t('customer.footer.gdpr')}
          </FooterLink>
        </Footer>
      </Shell>
    </ThemeProvider>
  )
}

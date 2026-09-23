import { useEffect, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../../../shared/api/refresh'
import { CallButton } from './CallButton'
import { LanguageSelector } from '../../../shared/i18n/LanguageSelector'
import { useFleetBranding } from './useFleetBranding'
import { ensureFleetSlug } from './ensureFleetSlug'
import { useThemeMode } from '../../../shared/theme/useThemeMode'
import { accentCssVars } from '../../../shared/theme/accent'

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  min-width: 320px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
  overflow-x: hidden;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  background: var(--surface);
  border-bottom: 1px solid var(--line);
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
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
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
  border-top: 1px solid var(--line);
`

const FooterLink = styled.a`
  font-size: var(--fs-label);
  color: var(--accent-text);

  &:focus-visible {
    outline: 3px solid var(--accent);
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
  const { resolved } = useThemeMode()
  const brandVars = accentCssVars(fleet?.primaryColorHex, resolved === 'dark')

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
      <Shell style={brandVars}>
        <Header>
          <Brand>
            {fleet?.logoUrl && (
              <Logo src={fleet.logoUrl} alt={fleet.name ?? t('customer.appName')} />
            )}
            <FleetName>{fleet?.name ?? t('customer.appName')}</FleetName>
          </Brand>
          <HeaderActions>
            <LanguageSelector />
            <CallButton phone={fleet?.phone} />
          </HeaderActions>
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

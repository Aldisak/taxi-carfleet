import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BottomSheet, FleetChip, ListRow, ListIcon, Segmented, Icon } from '../../../shared/ui'
import { LanguageSelector } from '../../../shared/i18n/LanguageSelector'
import { useThemeMode } from '../../../shared/theme/useThemeMode'
import type { ThemeMode } from '../../../shared/theme/themeMode'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'

const Identity = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 4px;
`

const SignedIn = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionLabel = styled.h2`
  margin: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const Rows = styled.div`
  display: flex;
  flex-direction: column;
`

/** Props for the customer app menu sheet. */
export interface CustomerMenuProps {
  /** Whether the menu sheet is open. */
  open: boolean
  /** Close the menu (Escape / backdrop / after an action). */
  onClose: () => void
  /** The resolved fleet identity (name, logo, phone) — may be undefined while loading. */
  fleet: { name?: string; logoUrl?: string | null; phone?: string | null } | undefined
}

/**
 * The customer app menu — a bottom sheet with the fleet identity, primary destinations
 * (history, call, privacy), the appearance (light/dark/system) and language pickers, and
 * sign-out. Uses the shared UI kit; all strings come from the `customer.menu.*` i18n block.
 * Sign-out and the language/theme pickers only mutate their own stores; navigation closes
 * the sheet first so focus returns cleanly.
 */
export function CustomerMenu({ open, onClose, fleet }: CustomerMenuProps): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { mode, setMode } = useThemeMode()

  const isAuthenticated = authStorage.getAccessToken() != null
  const phone = fleet?.phone ?? authStorage.getFleetPhone()
  const fleetName = fleet?.name ?? t('customer.appName')

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('customer.menu.themeSystem') },
    { value: 'light', label: t('customer.menu.themeLight') },
    { value: 'dark', label: t('customer.menu.themeDark') },
  ]

  function go(path: string): void {
    onClose()
    navigate(path)
  }

  async function handleLogout(): Promise<void> {
    authStorage.clear()
    await idbAuthStore.clear()
    onClose()
    navigate('/customer/login')
  }

  return (
    <BottomSheet open={open} snap="full" ariaLabelKey="customer.menu.sheetLabel" onClose={onClose}>
      <Identity>
        <FleetChip name={fleetName} logoUrl={fleet?.logoUrl} />
        {isAuthenticated && phone && (
          <SignedIn>{t('customer.menu.signedInAs', { phone })}</SignedIn>
        )}
      </Identity>

      <Rows>
        <ListRow
          icon={<ListIcon icon={<Icon name="history" />} />}
          title={t('customer.menu.history')}
          onClick={() => go('/customer/history')}
        />
        {phone && (
          <ListRow
            icon={<ListIcon icon={<Icon name="phone" />} />}
            title={t('customer.menu.call')}
            onClick={() => {
              window.location.href = `tel:${phone}`
            }}
          />
        )}
        <ListRow
          icon={<ListIcon icon={<Icon name="shield" />} />}
          title={t('customer.menu.privacy')}
          onClick={() => {
            onClose()
            window.open('/gdpr.md', '_blank', 'noopener,noreferrer')
          }}
        />
      </Rows>

      <Section>
        <SectionLabel>{t('customer.menu.appearance')}</SectionLabel>
        <Segmented
          options={themeOptions}
          value={mode}
          onChange={(v) => setMode(v as ThemeMode)}
          ariaLabel={t('customer.menu.appearance')}
        />
      </Section>

      <Section>
        <SectionLabel>{t('customer.menu.language')}</SectionLabel>
        <LanguageSelector />
      </Section>

      {isAuthenticated && (
        <Rows>
          <ListRow
            icon={<ListIcon icon={<Icon name="logout" />} />}
            title={t('customer.menu.logout')}
            onClick={handleLogout}
          />
        </Rows>
      )}
    </BottomSheet>
  )
}

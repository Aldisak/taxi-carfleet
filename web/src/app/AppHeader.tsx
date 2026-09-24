import styled from 'styled-components'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DeskButton } from '../shared/ui/desk'
import { IconButton } from '../shared/ui'
import { Icon } from '../shared/ui/icons/Icon'
import { LanguageSelector } from '../shared/i18n/LanguageSelector'
import type { ConnectionState } from '../shared/realtime/useFleetHub'
import type { ResolvedTheme } from '../shared/theme/themeMode'

/** Fleet branding shown on the left of the branded header. */
export interface HeaderBrand {
  /** Fleet / product name. */
  name: string | undefined
  /** Dot color as #RRGGBB (tenant data). When null the dot uses the ink token. */
  colorHex: string | null
}

/** One navigation entry rendered as a pill link. */
export interface HeaderNavItem {
  /** Router target. */
  to: string
  /** Accessible + visible label (already localized). */
  label: string
}

/** Props for the {@link AppHeader}. Presentational — all data/handlers are prop-drilled. */
export interface AppHeaderProps {
  /** Navigation entries (already role-filtered by the caller). */
  navItems: HeaderNavItem[]
  /** Left-side brand: dot color + name. In unbranded mode the dot is ink. */
  brand: HeaderBrand
  /** Live SignalR connection state (branded only). */
  connection?: ConnectionState
  /** Whether notification sound is muted (branded only). */
  isMuted?: boolean
  /** Toggles the notification sound (branded only). */
  onToggleMute?: () => void
  /** The concrete applied theme, drives the toggle icon. */
  resolvedTheme: ResolvedTheme
  /** Flips between light and dark. */
  onToggleTheme: () => void
  /** Clears auth + navigates to login. */
  onLogout: () => void
  /** Short current-user role label (raw role string until i18n keys land). */
  roleLabel?: string
  /**
   * When true the header drops the fleet hub chrome (connection pill, mute) and paints an ink
   * dot — the SuperAdmin surface (WI-7) has no fleet hub. Language + theme + logout stay in both.
   */
  unbranded?: boolean
}

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  padding: 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const Dot = styled.span<{ $color: string }>`
  width: 12px;
  height: 12px;
  border-radius: var(--r-pill);
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`

const BrandName = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink);
  white-space: nowrap;
`

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
`

const NavPill = styled(NavLink)`
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  font-size: var(--fs-label);
  color: var(--ink-2);
  text-decoration: none;

  &:hover {
    background: var(--surface-2);
    color: var(--ink);
  }

  &[aria-current='page'] {
    background: var(--surface-2);
    color: var(--ink);
    font-weight: var(--fw-bold);
  }
`

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
`

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--ink-2);
  white-space: nowrap;
`

const StatusDot = styled.span<{ $tone: string }>`
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  background: ${({ $tone }) => $tone};
`

const Role = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
  white-space: nowrap;
`

const LangSlot = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`

function statusTone(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'var(--success)'
    case 'connecting':
    case 'reconnecting':
      return 'var(--warning)'
    case 'disconnected':
    default:
      return 'var(--danger)'
  }
}

/**
 * The authenticated desk shell header (56px). Presentational: the branded dispatcher path
 * (AppLayout) supplies fleet + connection + mute; the unbranded admin path (WI-7) omits them
 * and passes an ink brand. Language, theme toggle and logout render in both modes.
 */
export function AppHeader({
  navItems,
  brand,
  connection,
  isMuted = false,
  onToggleMute,
  resolvedTheme,
  onToggleTheme,
  onLogout,
  roleLabel,
  unbranded = false,
}: AppHeaderProps): JSX.Element {
  const { t } = useTranslation()
  const dotColor = unbranded || !brand.colorHex ? 'var(--ink)' : brand.colorHex
  const brandName = brand.name ?? t('app.title')

  return (
    <Bar>
      <Brand>
        <Dot $color={dotColor} aria-hidden="true" />
        <BrandName>{brandName}</BrandName>
      </Brand>

      <Nav>
        {navItems.map(item => (
          <NavPill key={item.to} to={item.to} end={item.to.split('/').length <= 2}>
            {item.label}
          </NavPill>
        ))}
      </Nav>

      <Right>
        {!unbranded && connection !== undefined && (
          <Status>
            <StatusDot $tone={statusTone(connection)} aria-hidden="true" />
            {t(`appLayout.${connection}`)}
          </Status>
        )}

        {!unbranded && (
          <IconButton
            icon={<Icon name="bell" size={20} />}
            label={isMuted ? t('nav.unmute') : t('nav.mute')}
            aria-pressed={isMuted}
            data-testid="mute-toggle"
            onClick={onToggleMute}
          />
        )}

        <LangSlot>
          <Icon name="globe" size={18} aria-hidden="true" />
          <LanguageSelector />
        </LangSlot>

        <IconButton
          icon={<Icon name={resolvedTheme === 'light' ? 'moon' : 'sun'} size={20} />}
          label={t('appLayout.themeToggle')}
          onClick={onToggleTheme}
        />

        {roleLabel !== undefined && roleLabel !== '' && <Role>{roleLabel}</Role>}

        <DeskButton size="xs" variant="outline" onClick={onLogout}>
          {t('nav.logout')}
        </DeskButton>
      </Right>
    </Bar>
  )
}

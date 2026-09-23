import styled, { css } from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { Icon } from '../../../shared/ui'

const textBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 20px;
  background: var(--accent);
  color: var(--on-accent);
  text-decoration: none;
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-extra);
  font-family: var(--font);
  border: none;
  border-radius: var(--r-md);

  &:focus-visible {
    outline: 3px solid var(--ink);
    outline-offset: 2px;
  }
`

const Anchor = styled.a`
  ${textBase}
`

const DisabledButton = styled.button`
  ${textBase}
  background: var(--surface-3);
  color: var(--ink-3);
  cursor: not-allowed;
`

// Icon-only variant: a 48px round accent tel link for the map-first top bar.
const iconBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--r-pill);
  border: none;
  text-decoration: none;

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
`

const IconAnchor = styled.a`
  ${iconBase}
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: var(--shadow-card);
`

const IconDisabled = styled.button`
  ${iconBase}
  background: var(--surface);
  color: var(--ink-3);
  box-shadow: var(--shadow-card);
  cursor: not-allowed;
`

/** Props for CallButton. */
export interface CallButtonProps {
  /** E.164 fleet phone number; null/undefined while branding is loading. */
  phone: string | null | undefined
  /** Render a 48px round accent icon button (map-first top bar) instead of the text button. */
  iconOnly?: boolean
}

/**
 * The persistent "Zavolat" action present on every /c screen — the phone is always
 * the fallback (spec §Home). Renders a tel: link with an i18n aria-label.
 *
 * F1: the phone must NEVER disappear. The live branding phone takes priority; when it is
 * not yet known (cold start, failed public/fleet, offline launch) it falls back to the
 * phone persisted by useFleetBranding. If the number is genuinely never known, it renders
 * a visible disabled control rather than nothing, so the call affordance always shows.
 */
export function CallButton({ phone, iconOnly = false }: CallButtonProps) {
  const { t } = useTranslation()

  const effectivePhone = phone ?? authStorage.getFleetPhone()

  if (iconOnly) {
    if (!effectivePhone) {
      return (
        <IconDisabled type="button" disabled aria-label={t('customer.callUnavailableAria')}>
          <Icon name="phone" />
        </IconDisabled>
      )
    }
    return (
      <IconAnchor
        href={`tel:${effectivePhone}`}
        aria-label={t('customer.callAria', { phone: effectivePhone })}
      >
        <Icon name="phone" />
      </IconAnchor>
    )
  }

  if (!effectivePhone) {
    return (
      <DisabledButton type="button" disabled aria-label={t('customer.callUnavailableAria')}>
        {t('customer.call')}
      </DisabledButton>
    )
  }

  return (
    <Anchor href={`tel:${effectivePhone}`} aria-label={t('customer.callAria', { phone: effectivePhone })}>
      {t('customer.call')}
    </Anchor>
  )
}

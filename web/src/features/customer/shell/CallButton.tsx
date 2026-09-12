import styled, { css } from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'

const buttonBase = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: ${({ theme }) => theme.touchTargets.primary};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  text-decoration: none;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const Anchor = styled.a`
  ${buttonBase}
`

const DisabledButton = styled.button`
  ${buttonBase}
  background: ${({ theme }) => theme.colors.textSecondary};
  cursor: not-allowed;
`

/** Props for CallButton. */
export interface CallButtonProps {
  /** E.164 fleet phone number; null/undefined while branding is loading. */
  phone: string | null | undefined
}

/**
 * The persistent "Zavolat" action present on every /c screen — the phone is always
 * the fallback (spec §Home). Renders a tel: link sized >= 48 px with an i18n aria-label.
 *
 * F1: the phone must NEVER disappear. The live branding phone takes priority; when it is
 * not yet known (cold start, failed public/fleet, offline launch) it falls back to the
 * phone persisted by useFleetBranding. If the number is genuinely never known, it renders
 * a visible disabled button rather than nothing, so the offline banner always shows a
 * call affordance.
 */
export function CallButton({ phone }: CallButtonProps) {
  const { t } = useTranslation()

  const effectivePhone = phone ?? authStorage.getFleetPhone()

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

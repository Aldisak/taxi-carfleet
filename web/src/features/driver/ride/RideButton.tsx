import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { RideButtonState } from './rideButtonState'

const Area = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const PrimaryButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.success};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const NavButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
`

const SecondaryButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: none;
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`

interface RideButtonProps {
  state: RideButtonState
  pending: boolean
  onPrimary: () => void
  onNav: () => void
  onSecondary: () => void
}

/** Status-driven action buttons for the active ride screen (presentational). */
export function RideButton({ state, pending, onPrimary, onNav, onSecondary }: RideButtonProps) {
  const { t } = useTranslation()

  const secondaryLabel =
    state.secondaryAction === 'noShow' && !state.noShowEnabled && state.noShowCountdownSeconds != null
      ? t('driver.ride.noShowCountdown', { sec: state.noShowCountdownSeconds })
      : state.secondaryLabel
        ? t(state.secondaryLabel)
        : ''

  return (
    <Area>
      {state.navAction && state.navLabel && (
        <NavButton type="button" onClick={onNav}>
          {t(state.navLabel)}
        </NavButton>
      )}

      {state.primaryAction && state.primaryLabel && (
        <PrimaryButton type="button" disabled={pending} onClick={onPrimary}>
          {t(state.primaryLabel)}
        </PrimaryButton>
      )}

      {state.secondaryAction === 'noShow' && (
        <SecondaryButton
          type="button"
          disabled={!state.noShowEnabled || pending}
          onClick={onSecondary}
        >
          {secondaryLabel}
        </SecondaryButton>
      )}
    </Area>
  )
}

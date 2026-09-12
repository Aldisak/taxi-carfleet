import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
`

const PermissionCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const PermissionTitle = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const PermissionDesc = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight};
`

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.xs};
`

const AllowButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;
`

const SkipButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
`

interface PermissionPrimingProps {
  /** Called when the driver taps Allow for location. */
  onRequestLocation?: () => void
  /** Called when the driver taps Allow for notifications. */
  onRequestNotifications?: () => void
  /** Called when the driver taps Skip (for any permission). */
  onSkip?: () => void
}

/**
 * Permission priming screens for location and notification permissions.
 * Provides a one-sentence Czech explanation before the browser prompt.
 */
export function PermissionPriming({
  onRequestLocation,
  onRequestNotifications,
  onSkip,
}: PermissionPrimingProps) {
  const { t } = useTranslation()

  return (
    <Wrapper>
      <PermissionCard>
        <PermissionTitle>{t('driver.permissions.locationTitle')}</PermissionTitle>
        <PermissionDesc>{t('driver.permissions.locationDescription')}</PermissionDesc>
        <ButtonRow>
          <AllowButton type="button" onClick={onRequestLocation}>
            {t('driver.permissions.allow')}
          </AllowButton>
          <SkipButton type="button" onClick={onSkip}>
            {t('driver.permissions.skip')}
          </SkipButton>
        </ButtonRow>
      </PermissionCard>

      <PermissionCard>
        <PermissionTitle>{t('driver.permissions.notificationsTitle')}</PermissionTitle>
        <PermissionDesc>{t('driver.permissions.notificationsDescription')}</PermissionDesc>
        <ButtonRow>
          <AllowButton type="button" onClick={onRequestNotifications}>
            {t('driver.permissions.allow')}
          </AllowButton>
          <SkipButton type="button" onClick={onSkip}>
            {t('driver.permissions.skip')}
          </SkipButton>
        </ButtonRow>
      </PermissionCard>
    </Wrapper>
  )
}

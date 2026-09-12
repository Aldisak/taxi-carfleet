import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.sm} 0;
`

const ReasonButton = styled.button<{ $selected: boolean }>`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 2px solid ${({ $selected, theme }) =>
    $selected ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary : theme.colors.surface};
  color: ${({ $selected, theme }) =>
    $selected ? '#ffffff' : theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
`

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`

export const DECLINE_REASONS = ['Daleko', 'Mám pauzu', 'Jiný důvod'] as const
export type DeclineReason = typeof DECLINE_REASONS[number]

interface DeclineReasonsProps {
  selectedReason: string | null
  onSelect: (reason: string) => void
  showError?: boolean
}

/**
 * Reason picker for declining an order offer.
 * Daleko / Mám pauzu / Jiný důvod
 */
export function DeclineReasons({ selectedReason, onSelect, showError }: DeclineReasonsProps) {
  const { t } = useTranslation()

  const reasonKeys: Record<string, string> = {
    'Daleko': 'driver.offer.declineReasonFar',
    'Mám pauzu': 'driver.offer.declineReasonBreak',
    'Jiný důvod': 'driver.offer.declineReasonOther',
  }

  return (
    <Wrapper>
      <Title>{t('driver.offer.declineReasonTitle')}</Title>
      {DECLINE_REASONS.map(reason => (
        <ReasonButton
          key={reason}
          type="button"
          $selected={selectedReason === reason}
          onClick={() => onSelect(reason)}
        >
          {t(reasonKeys[reason] ?? reason)}
        </ReasonButton>
      ))}
      {showError && (
        <ErrorText>{t('driver.offer.declineReasonRequired')}</ErrorText>
      )}
    </Wrapper>
  )
}

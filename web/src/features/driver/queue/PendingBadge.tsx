import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`

const Dot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.text};
  animation: pulse 1.2s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
`

/**
 * "čeká na odeslání" indicator for queued transitions awaiting replay.
 * Renders nothing when the queue is empty.
 */
export function PendingBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count <= 0) return null
  return (
    <Badge role="status" aria-live="polite">
      <Dot aria-hidden="true" />
      {t('driver.queue.pending')}
    </Badge>
  )
}

import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'

const Banner = styled.div`
  background: var(--warning-bg);
  color: var(--ink);
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 10;
`

/**
 * Yellow banner shown during SignalR disconnect or reconnecting states.
 * Renders nothing when connected.
 */
export function DisconnectBanner() {
  const { t } = useTranslation()
  const state = useHubConnectionState()

  if (!isServerActionBlocked(state)) return null

  return (
    <Banner role="alert" aria-live="polite" data-testid="disconnect-banner">
      {t('app.offline')}
    </Banner>
  )
}

import styled from 'styled-components'
import { useQueuePendingCount, useQueueReplayOnReconnect } from './useTransitionQueue'
import { PendingBadge } from './PendingBadge'

const Bar = styled.div`
  display: flex;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
`

/**
 * Session-wide queue bar, mounted in DriverLayout.
 *
 * Owns the reconnect-drain (useQueueReplayOnReconnect) so a queued transition replays FIFO on
 * reconnect regardless of which /d sub-route is shown — a queued complete/no-show navigates Home,
 * so the drainer must survive those unmounts. Also renders the "čeká na odeslání" indicator
 * wherever the driver lands.
 */
export function DriverQueueBar() {
  useQueueReplayOnReconnect()
  const pendingCount = useQueuePendingCount()
  if (pendingCount <= 0) return null
  return (
    <Bar>
      <PendingBadge count={pendingCount} />
    </Bar>
  )
}

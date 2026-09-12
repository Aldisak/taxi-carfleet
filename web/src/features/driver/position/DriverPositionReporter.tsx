import { useDriverMe } from '../home/useDriverMe'
import { usePositionReporting } from './usePositionReporting'
import { StalePositionBanner } from './StalePositionBanner'

/**
 * Session-wide position reporter, mounted in DriverLayout so it survives /d sub-route changes.
 *
 * Reports the driver's position while online (status !== 'Offline') and renders the red
 * stale-position banner when nothing has been successfully sent for >= 60s.
 */
export function DriverPositionReporter() {
  const { data: me } = useDriverMe()
  const online = me != null && me.status !== 'Offline'
  const { stale } = usePositionReporting(online)
  return <StalePositionBanner stale={stale} />
}

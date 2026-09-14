import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDriverMe, getOrder, type OrderDetailDto } from '../../../shared/api/client'
import { idbRideStore } from './idbRideStore'
import { useActiveOrderStore } from './useActiveOrderStore'

const TERMINAL_STATUSES = new Set(['Completed', 'Cancelled'])

/** Outcome of the active ride reconciliation check. */
export type ReconcileOutcome = 'active' | 'terminal' | 'none'

/** Result of reconcileActiveRide. */
export interface ReconcileResult {
  outcome: ReconcileOutcome
  order?: OrderDetailDto
  arrivedAt?: string | null
}

/**
 * Reconciles the active ride on load. IndexedDB is only used for instant paint and
 * for the local arrivedAt timestamp; the server (GET /drivers/me -> activeOrderId)
 * is authoritative (AC #6):
 *
 * - server activeOrderId null -> 'none' (stale local IDB is cleared)
 * - server activeOrderId set + order terminal -> 'terminal' (IDB cleared, go Home)
 * - server activeOrderId set + order non-terminal -> 'active'
 *   - if IDB had no local id (cold rebuild) the server id is persisted
 *   - arrivedAt is carried from IDB only when the local id matches the server id
 *
 * @param myDriverId  The authenticated driver's ID (reserved for logging/future use)
 */
export async function reconcileActiveRide(myDriverId: string): Promise<ReconcileResult> {
  void myDriverId
  const localOrderId = await idbRideStore.getActiveOrderId()

  // The server is the source of truth for which order (if any) is active.
  const me = await getDriverMe()
  const serverOrderId = me.activeOrderId

  if (!serverOrderId) {
    // No active order on the server — any local id is stale.
    if (localOrderId) await idbRideStore.clear()
    return { outcome: 'none' }
  }

  const order = await getOrder(serverOrderId)

  if (TERMINAL_STATUSES.has(order.status)) {
    await idbRideStore.clear()
    return { outcome: 'terminal', order }
  }

  // Non-terminal active ride. Persist the id when it was rebuilt from the server
  // (cold start with empty IDB) so a subsequent reload paints instantly.
  if (localOrderId !== serverOrderId) {
    await idbRideStore.setActiveOrderId(serverOrderId)
    return { outcome: 'active', order, arrivedAt: null }
  }

  const arrivedAt = await idbRideStore.getArrivedAt()
  return { outcome: 'active', order, arrivedAt }
}

/**
 * Hook: on mount, reconciles the active ride from the server + IDB.
 * - Active -> hydrates the store
 * - Terminal/none -> clears store + navigates Home
 * Requires the component to be inside a router context.
 *
 * @param myDriverId  Authenticated driver ID
 */
export function useRideRestore(myDriverId: string | undefined) {
  const navigate = useNavigate()
  const setOrder = useActiveOrderStore(s => s.setOrder)
  const setArrivedAt = useActiveOrderStore(s => s.setArrivedAt)
  const clear = useActiveOrderStore(s => s.clear)

  useEffect(() => {
    if (!myDriverId) return

    void reconcileActiveRide(myDriverId).then(result => {
      if (result.outcome === 'active' && result.order) {
        setOrder(result.order)
        if (result.arrivedAt) setArrivedAt(result.arrivedAt)
      } else {
        // 'terminal' or 'none' -> no active ride, go Home.
        clear()
        navigate('/driver', { replace: true })
      }
    })
  }, [myDriverId]) // eslint-disable-line react-hooks/exhaustive-deps
}

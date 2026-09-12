import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizeDriverStatus } from '../../../shared/realtime/eventReducer'
import { useActiveOrderStore } from './useActiveOrderStore'
import { idbRideStore } from './idbRideStore'

interface OrderChangedDetail {
  id: string
  driverId: string | null
  status: string | number
  version: number
}

interface StatusChangedDetail {
  driverId: string
  status: string | number
}

/**
 * F-04 live-clear hook: listens for hub events that indicate the active order was
 * reassigned and clears the ride state + navigates Home with a toast.
 *
 * Two triggers:
 * 1. driver:statusChanged with own driverId + status=Free (dispatcher reassigned)
 * 2. driver:orderChanged for the active order with driverId ≠ myDriverId (direct reassign)
 *
 * Mount this inside DriverRidePage (while an active order exists).
 *
 * @param myDriverId  The authenticated driver's own ID
 */
export function useLiveClear(myDriverId: string | undefined) {
  const navigate = useNavigate()
  const activeOrder = useActiveOrderStore(s => s.order)
  const clear = useActiveOrderStore(s => s.clear)

  useEffect(() => {
    if (!myDriverId) return

    function handleStatusChanged(e: Event) {
      const detail = (e as CustomEvent<StatusChangedDetail>).detail
      if (detail.driverId !== myDriverId) return
      const status = normalizeDriverStatus(detail.status)
      if (status !== 'Free') return

      void idbRideStore.clear()
      clear()
      navigate('/d', { replace: true, state: { toast: 'driver.ride.reassigned' } })
    }

    function handleOrderChanged(e: Event) {
      const detail = (e as CustomEvent<OrderChangedDetail>).detail
      if (!activeOrder || detail.id !== activeOrder.id) return
      // Clear if driverId changed to someone else (null or different driver)
      if (detail.driverId === myDriverId) return

      void idbRideStore.clear()
      clear()
      navigate('/d', { replace: true, state: { toast: 'driver.ride.reassigned' } })
    }

    window.addEventListener('driver:statusChanged', handleStatusChanged)
    window.addEventListener('driver:orderChanged', handleOrderChanged)
    return () => {
      window.removeEventListener('driver:statusChanged', handleStatusChanged)
      window.removeEventListener('driver:orderChanged', handleOrderChanged)
    }
  }, [myDriverId, activeOrder, clear, navigate])
}

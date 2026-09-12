import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { GetDriverMeResponse } from '../../../shared/api/client'
import { normalizeDriverStatus } from '../../../shared/realtime/eventReducer'

interface DriverStatusChangedPayload {
  driverId: string
  status: string | number
}

/**
 * Listens to the SignalR DriverStatusChanged event and patches the ['driver','me'] cache
 * when the event is for our own driverId.
 *
 * Must be called from a component that is inside the QueryClient provider.
 * Uses normalizeDriverStatus from eventReducer to keep the enum mapping authoritative.
 */
export function useOwnStatusSync(myDriverId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!myDriverId) return

    // We hook into the window-level event dispatched by the hub listener extension.
    // The useFleetHub extension fires 'driver:statusChanged' CustomEvent on window.
    function handleStatusChanged(e: Event) {
      const payload = (e as CustomEvent<DriverStatusChangedPayload>).detail
      if (payload.driverId !== myDriverId) return

      const statusStr = normalizeDriverStatus(payload.status)

      queryClient.setQueryData<GetDriverMeResponse>(
        ['driver', 'me'],
        old => old ? { ...old, status: statusStr } : old,
      )
    }

    window.addEventListener('driver:statusChanged', handleStatusChanged)
    return () => { window.removeEventListener('driver:statusChanged', handleStatusChanged) }
  }, [myDriverId, queryClient])
}

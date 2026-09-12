import { useEffect } from 'react'
import type { OrderDetailDto } from '../../../shared/api/client'
import { useOfferStore } from './useOfferStore'

/**
 * Listens for driver:newOrderOffered CustomEvents dispatched by useFleetHub
 * and writes the offer into the Zustand store.
 *
 * Mount this once in DriverLayout or DriverHomePage so the offer takeover
 * appears regardless of which sub-route the driver is on.
 */
export function useOfferListener() {
  const setOffer = useOfferStore(s => s.setOffer)

  useEffect(() => {
    function handleOffer(e: Event) {
      const { dto, expiresAt } = (e as CustomEvent<{ dto: OrderDetailDto; expiresAt: string }>).detail
      setOffer({ dto, expiresAt })
    }
    window.addEventListener('driver:newOrderOffered', handleOffer)
    return () => { window.removeEventListener('driver:newOrderOffered', handleOffer) }
  }, [setOffer])
}

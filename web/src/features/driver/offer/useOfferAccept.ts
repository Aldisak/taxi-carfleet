import { useState, useRef } from 'react'
import { postAcceptOrder, ApiResponseError } from '../../../shared/api/client'

export type AcceptOutcome =
  | { type: 'success' }
  | { type: 'stale' }   // 404 or 409 — offer no longer available
  | { type: 'offline' } // network error
  | { type: 'noop' }    // duplicate tap guard — already in flight

export interface UseOfferAcceptResult {
  isPending: boolean
  accept: (orderId: string) => Promise<AcceptOutcome>
}

/**
 * Double-tap guard: disables on first tap until the response settles.
 * Uses a ref for synchronous guard (useState has stale-closure risk across rapid taps).
 * F-08: 404 (offer reassigned/timed out) AND 409 (conflict) both return 'stale'
 * so the takeover can dismiss with "Nabídka již není dostupná" toast.
 * Network error returns 'offline' so the takeover stays open.
 * Duplicate tap returns 'noop' (no UI side-effect).
 */
export function useOfferAccept(): UseOfferAcceptResult {
  const [isPending, setIsPending] = useState(false)
  const inFlightRef = useRef(false)

  async function accept(orderId: string): Promise<AcceptOutcome> {
    if (inFlightRef.current) return { type: 'noop' }
    inFlightRef.current = true
    setIsPending(true)
    try {
      await postAcceptOrder(orderId)
      return { type: 'success' }
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 404 || err.status === 409) {
          return { type: 'stale' }
        }
        // Other server errors (5xx etc.) treated as offline — keep takeover open
        return { type: 'offline' }
      }
      // TypeError (network error) — stay open
      return { type: 'offline' }
    } finally {
      inFlightRef.current = false
      setIsPending(false)
    }
  }

  return { isPending, accept }
}

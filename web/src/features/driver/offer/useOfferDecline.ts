import { useState } from 'react'
import { postDeclineOrder, ApiResponseError } from '../../../shared/api/client'

export type DeclineOutcome =
  | { type: 'success' }
  | { type: 'stale' }   // 404 or 409
  | { type: 'offline' } // network error
  | { type: 'noReason' } // reason not provided

export interface UseOfferDeclineResult {
  isPending: boolean
  decline: (orderId: string, reason: string) => Promise<DeclineOutcome>
}

/**
 * Driver decline hook.
 * F-08: 404 AND 409 both return 'stale' → dismiss + toast.
 * Empty reason returns 'noReason' without making a network call.
 * Network error returns 'offline' (stay open).
 */
export function useOfferDecline(): UseOfferDeclineResult {
  const [isPending, setIsPending] = useState(false)

  async function decline(orderId: string, reason: string): Promise<DeclineOutcome> {
    if (!reason.trim()) return { type: 'noReason' }
    if (isPending) return { type: 'offline' }
    setIsPending(true)
    try {
      await postDeclineOrder(orderId, reason)
      return { type: 'success' }
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 404 || err.status === 409) {
          return { type: 'stale' }
        }
        return { type: 'offline' }
      }
      return { type: 'offline' }
    } finally {
      setIsPending(false)
    }
  }

  return { isPending, decline }
}

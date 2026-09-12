import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postCancelOrder } from '../../../shared/api/client'

/**
 * Reason text sent to the cancel endpoint. The backend records CancelledByRole=Customer from
 * the JWT regardless of this text; the field is a human audit note. Kept as a plain constant
 * (not user-facing UI copy) so it is stable for the dispatcher's event log.
 */
const CUSTOMER_CANCEL_REASON = 'Zrušeno zákazníkem'

/** Reads an HTTP status off a thrown API error (ApiResponseError or any { status } shape). */
function errorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const s = (error as { status: unknown }).status
    return typeof s === 'number' ? s : null
  }
  return null
}

/** Result of {@link useCancelOrder}. */
export interface UseCancelOrderResult {
  /** Cancels the order; resolves true on success, false on failure (error surfaced via errorKey). */
  cancel: () => Promise<boolean>
  isPending: boolean
  /** i18n key for a plain-Czech error message, or null. */
  errorKey: string | null
}

/**
 * Cancels the customer's own order (POST orders/{id}/cancel with the customer JWT). A 409 means
 * the order can no longer be cancelled (it advanced past Accepted) → surfaces the
 * "Objednávku už nelze zrušit" message. On success the active-order + detail caches are
 * invalidated so the headline flips to Cancelled. No-ops when the order id is unknown (a
 * terminal/cold load has no id). Errors are surfaced via errorKey (never thrown) so the dialog
 * needs no try/catch — mirrors the driver useOfferAccept pattern.
 */
export function useCancelOrder(orderId: string | null): UseCancelOrderResult {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  async function cancel(): Promise<boolean> {
    if (orderId == null) return false
    setErrorKey(null)
    setIsPending(true)
    try {
      await postCancelOrder(orderId, CUSTOMER_CANCEL_REASON)
      void queryClient.invalidateQueries({ queryKey: ['orders', 'mine', 'active'] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'track', 'by-code'] })
      return true
    } catch (error) {
      setErrorKey(errorStatus(error) === 409 ? 'customer.tracking.cancelTooLate' : 'customer.tracking.cancelFailed')
      return false
    } finally {
      setIsPending(false)
    }
  }

  return { cancel, isPending, errorKey }
}

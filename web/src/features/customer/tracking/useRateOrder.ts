import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getMyOrderHistory, rateOrder } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { resolveRatingView, type RatingView } from './ratingRules'

/** Reads an HTTP status off a thrown API error (ApiResponseError or any { status } shape). */
function errorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const s = (error as { status: unknown }).status
    return typeof s === 'number' ? s : null
  }
  return null
}

/** Result of {@link useRateOrder}. */
export interface UseRateOrderResult {
  /** Whether to render the form or the read-only "thanks" state. */
  view: RatingView
  /** The resolved order id (null until the history lookup finds the row). */
  orderId: string | null
  /** Submits the rating (stars 1..5 + optional comment). Resolves when the attempt completes. */
  submit: (stars: number, comment: string) => Promise<void>
  isPending: boolean
  /** i18n key for a plain-Czech submit error, or null. */
  errorKey: string | null
}

/**
 * Rating controller for the Completed tracking view (B-rating). The rating POST needs the order
 * id, but neither the by-code tracking DTO nor getMyActiveOrder (terminal orders are excluded)
 * carries it — so the id (and the already-rated state) is resolved from the customer's own order
 * history (GET orders/mine), matched on publicCode. Gated on a stored token (rating is authed-only
 * and CustomerOnly); an ungated read would 401 → silent-refresh redirect.
 *
 * Once-per-order: an order that already has a rating (ratingStars != null), or one submitted
 * locally, shows the read-only "Děkujeme" state. A 409 on submit (already rated server-side) is
 * treated as already-rated, not an error crash.
 */
export function useRateOrder(publicCode: string): UseRateOrderResult {
  const queryClient = useQueryClient()
  const hasToken = authStorage.getAccessToken() !== null
  const enabled = hasToken && publicCode.length > 0

  const { data } = useQuery({
    queryKey: ['orders', 'mine', 'list', 1],
    queryFn: () => getMyOrderHistory(1, 20),
    enabled,
    retry: false,
  })

  const row = data?.items.find((o) => o.publicCode === publicCode) ?? null
  const orderId = row?.id ?? null
  const existingStars = row?.ratingStars ?? null

  const [submitted, setSubmitted] = useState(false)
  const [submittedStars, setSubmittedStars] = useState<number | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  async function submit(stars: number, comment: string): Promise<void> {
    if (orderId == null) return
    setErrorKey(null)
    setIsPending(true)
    const trimmed = comment.trim()
    try {
      await rateOrder(orderId, { stars, comment: trimmed === '' ? null : trimmed })
      setSubmittedStars(stars)
      setSubmitted(true)
      void queryClient.invalidateQueries({ queryKey: ['orders', 'mine', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['orders', 'detail', orderId] })
    } catch (error) {
      // 409 = already rated server-side → converge on the already-rated state (not a crash).
      if (errorStatus(error) === 409) {
        setSubmittedStars(stars)
        setSubmitted(true)
      } else {
        setErrorKey('customer.rating.submitFailed')
      }
    } finally {
      setIsPending(false)
    }
  }

  return {
    view: resolveRatingView({ existingStars, submitted, submittedStars }),
    orderId,
    submit,
    isPending,
    errorKey,
  }
}

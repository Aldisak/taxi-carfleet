import { useState, useRef } from 'react'
import { type CompleteOrderRequest } from '../../../shared/api/client'
import { enqueueAndDrainTransition } from '../queue/useTransitionQueue'

/** Outcome of a complete-ride attempt. */
export type CompleteOutcome =
  | { type: 'success' }  // delivered to the server this attempt
  | { type: 'queued' }   // offline / 5xx / InFlight — kept in the queue, replays on reconnect
  | { type: 'stale' }    // definitive 4xx — order's items dropped + reconciled from server
  | { type: 'noop' }     // double-tap guard

/** Hook result for completing a ride. */
export interface UseCompleteRideResult {
  isPending: boolean
  complete: (orderId: string, req: CompleteOrderRequest) => Promise<CompleteOutcome>
}

/**
 * Hook: completes the active ride via the offline transition queue (B-queue).
 *
 * The complete is enqueued with an idempotency key minted once at enqueue time; online it is
 * sent and dequeued in this call ('success'), offline it stays queued ('queued') and replays on
 * reconnect, and a definitive 4xx drops the order's items + reconciles ('stale'). On a successful
 * send the queue's send mapper clears the active-ride store + IndexedDB. A double-tap while a
 * request is in flight is a 'noop'.
 */
export function useCompleteRide(): UseCompleteRideResult {
  const [isPending, setIsPending] = useState(false)
  const inFlightRef = useRef(false)

  async function complete(orderId: string, req: CompleteOrderRequest): Promise<CompleteOutcome> {
    if (inFlightRef.current) return { type: 'noop' }
    inFlightRef.current = true
    setIsPending(true)
    try {
      return await enqueueAndDrainTransition({
        action: 'complete',
        orderId,
        payload: {
          finalPriceCzk: req.finalPriceCzk,
          paymentType: req.paymentType,
          overrideReason: req.overrideReason,
        },
      })
    } finally {
      inFlightRef.current = false
      setIsPending(false)
    }
  }

  return { isPending, complete }
}

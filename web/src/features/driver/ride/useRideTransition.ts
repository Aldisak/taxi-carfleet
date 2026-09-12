import { useRef, useState } from 'react'
import { enqueueAndDrainTransition } from '../queue/useTransitionQueue'

export type TransitionOutcome =
  | { type: 'success' }   // delivered to the server
  | { type: 'queued' }    // offline / 5xx / InFlight — kept in the queue, replays on reconnect
  | { type: 'stale' }     // definitive 4xx (terminal 409 / 404 / KeyReused) — dropped + reconciled
  | { type: 'noop' }      // duplicate-tap guard

/** Return type for ride transition actions. */
export interface UseRideTransitionResult {
  isPending: boolean
  arrive: (orderId: string) => Promise<TransitionOutcome>
  start: (orderId: string) => Promise<TransitionOutcome>
  cancelNoShow: (orderId: string) => Promise<TransitionOutcome>
}

/**
 * Hook: manages ride state transitions (arrive / start / no-show cancel).
 *
 * Every transition is routed through the offline transition queue (B-queue): the idempotency
 * key is minted once at enqueue time and preserved across every retry, so a replay is deduped
 * to exactly-once by the server (A-idem). Online, the item is sent and dequeued in the same
 * call ('success'); offline it stays queued ('queued') and replays FIFO on reconnect; a
 * definitive 4xx drops the order's items and reconciles from GET /orders/{id} ('stale').
 *
 * The store/IDB updates now live inside the queue's send/reconcile mappers, so this hook only
 * owns the double-tap guard + pending flag.
 */
export function useRideTransition(): UseRideTransitionResult {
  const [isPending, setIsPending] = useState(false)
  const inFlightRef = useRef(false)

  async function run(action: 'arrive' | 'start' | 'cancelNoShow', orderId: string): Promise<TransitionOutcome> {
    if (inFlightRef.current) return { type: 'noop' }
    inFlightRef.current = true
    setIsPending(true)
    try {
      const outcome = await enqueueAndDrainTransition({ action, orderId, payload: null })
      return outcome
    } finally {
      inFlightRef.current = false
      setIsPending(false)
    }
  }

  return {
    isPending,
    arrive: (orderId) => run('arrive', orderId),
    start: (orderId) => run('start', orderId),
    cancelNoShow: (orderId) => run('cancelNoShow', orderId),
  }
}

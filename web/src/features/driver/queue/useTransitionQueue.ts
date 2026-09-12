import { useEffect, useState } from 'react'
import {
  postArriveOrder,
  postStartOrder,
  postCompleteOrder,
  postDriverCancelOrder,
  getOrder,
} from '../../../shared/api/client'
import { useHubConnectionState } from '../../../shared/realtime/useFleetHub'
import { useActiveOrderStore } from '../ride/useActiveOrderStore'
import { idbRideStore } from '../ride/idbRideStore'
import { transitionQueue, type QueuedTransition, type QueuedAction, type CompletePayload } from './transitionQueue'
import { drainQueue } from './queueReplay'

const TERMINAL_STATUSES = new Set(['Completed', 'Cancelled'])

/** Outcome of enqueuing + attempting to drain a single transition. */
export type QueueOutcome =
  | { type: 'success' }  // delivered to the server this attempt
  | { type: 'queued' }   // kept in the queue (offline / 5xx / InFlight) — will replay on reconnect
  | { type: 'stale' }    // definitive 4xx — order's items dropped + reconciled from server

/**
 * Sends one queued transition to the API using its enqueue-time idempotency key, then applies
 * the resulting order to the active-ride store. Throws on any API failure so drainQueue can
 * classify the outcome (queueReplay.classifyReplayOutcome).
 */
export async function sendTransition(item: QueuedTransition): Promise<void> {
  const store = useActiveOrderStore.getState()
  switch (item.action) {
    case 'arrive': {
      const res = await postArriveOrder(item.orderId, item.idempotencyKey)
      const now = new Date().toISOString()
      await idbRideStore.setArrivedAt(now)
      store.setArrivedAt(now)
      store.updateOrder(res.order)
      return
    }
    case 'start': {
      const res = await postStartOrder(item.orderId, item.idempotencyKey)
      store.updateOrder(res.order)
      return
    }
    case 'complete': {
      const payload = item.payload as CompletePayload
      await postCompleteOrder(item.orderId, payload, item.idempotencyKey)
      await idbRideStore.clear()
      store.clear()
      return
    }
    case 'cancelNoShow': {
      await postDriverCancelOrder(item.orderId, 'no-show', item.idempotencyKey)
      await idbRideStore.clear()
      store.clear()
      return
    }
  }
}

/**
 * Reconciles an order after a definitive 4xx drop (B3c-1 real behavior): fetch the current
 * order from the server. If it is terminal, clear the active ride + IDB; otherwise patch the
 * store with the server's authoritative state.
 */
async function reconcileOrder(orderId: string): Promise<void> {
  try {
    const order = await getOrder(orderId)
    const store = useActiveOrderStore.getState()
    if (TERMINAL_STATUSES.has(order.status)) {
      await idbRideStore.clear()
      store.clear()
    } else {
      store.updateOrder(order)
    }
  } catch {
    // Reconcile is best-effort; a failed GET leaves the last-known state on screen.
  }
}

/**
 * Enqueues a transition (minting its idempotency key once) and immediately attempts a drain.
 *
 * Always enqueue-then-drain: one code path for online and offline. When online the item is sent
 * and dequeued in this call (QueueOutcome 'success'); when offline it stays queued ('queued')
 * and replays FIFO on reconnect; a definitive 4xx drops the order's items and reconciles ('stale').
 *
 * Call sites (useRideTransition / useCompleteRide) are unchanged — they map this outcome onto
 * their existing union.
 */
export async function enqueueAndDrainTransition(input: {
  action: QueuedAction
  orderId: string
  payload: CompletePayload | null
}): Promise<QueueOutcome> {
  const item = await transitionQueue.enqueue(input)

  let reconciled = false
  await drainQueue({
    send: sendTransition,
    reconcile: async (orderId) => {
      if (orderId === item.orderId) reconciled = true
      await reconcileOrder(orderId)
    },
  })

  if (reconciled) return { type: 'stale' }

  // If the item is still queued, it was kept (offline / 5xx / InFlight).
  const stillQueued = (await transitionQueue.peekAll()).some(i => i.id === item.id)
  return stillQueued ? { type: 'queued' } : { type: 'success' }
}

/**
 * Hook: live pending-queue count (subscribe only, no drain). Safe to mount on any screen that
 * shows the "čeká na odeslání" indicator.
 */
export function useQueuePendingCount(): number {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let active = true
    void transitionQueue.count().then(c => { if (active) setPendingCount(c) })
    const unsubscribe = transitionQueue.subscribe(c => { if (active) setPendingCount(c) })
    return () => { active = false; unsubscribe() }
  }, [])

  return pendingCount
}

/**
 * Hook: replays the queue FIFO whenever the hub (re)connects. Mount ONCE at the layout
 * (DriverLayout) so a queued transition replays regardless of which /d sub-route is shown —
 * a queued complete navigates Home, so the drainer must NOT live on the ride/complete screen.
 */
export function useQueueReplayOnReconnect(): void {
  const connectionState = useHubConnectionState()

  useEffect(() => {
    if (connectionState !== 'connected') return
    void drainQueue({ send: sendTransition, reconcile: reconcileOrder })
  }, [connectionState])
}

import { ApiResponseError } from '../../../shared/api/client'
import { transitionQueue, type QueuedTransition } from './transitionQueue'

/** Error code that marks a 409 as retryable rather than definitive (design-review F-02). */
const INFLIGHT_CODE = 'Idempotency.InFlight'

/** What to do with a queued item after a drain attempt. */
export type ReplayDecision =
  | 'dequeue'    // 2xx — remove the item, keep draining
  | 'keep'       // network / 5xx / InFlight 409 — stop, retry on next reconnect
  | 'reconcile'  // any other definitive 4xx (incl. 404, terminal 409, KeyReused) — drop order's items + GET

/**
 * Pure classifier: maps a send outcome (error or null) to a replay decision.
 *
 * F-02: an Idempotency.InFlight 409 is RETRYABLE — branch on the error CODE, not the status,
 * because a terminal-state 409 (different code) is definitive.
 * F-03: dequeue (drop+reconcile) on ANY definitive 2xx/4xx including 404 NotEntitled; keep
 * queued ONLY on a network error or 5xx.
 *
 * @param err  The thrown error, or null on success.
 */
export function classifyReplayOutcome(err: unknown | null): ReplayDecision {
  if (err === null || err === undefined) return 'dequeue'

  if (err instanceof ApiResponseError) {
    // 5xx — server is unhealthy; a retry may succeed.
    if (err.status >= 500) return 'keep'

    // InFlight 409 — the first copy is still executing server-side; retry after it completes.
    if (err.status === 409) {
      const code = err.body.errors?.[0]?.code
      if (code === INFLIGHT_CODE) return 'keep'
    }

    // Every other definitive 4xx (404 NotEntitled, terminal-state 409, KeyReused 409, 400, …):
    // the action cannot succeed as queued — drop this order's items and reconcile from the server.
    return 'reconcile'
  }

  // Non-ApiResponseError (e.g. TypeError 'Failed to fetch') = network error — keep queued.
  return 'keep'
}

/** Dependencies for draining the queue. */
export interface DrainDeps {
  /** Sends one queued transition to the API (throws on failure). */
  send: (item: QueuedTransition) => Promise<void>
  /** Reconciles an order from the server (GET /orders/{id}) after a definitive drop. */
  reconcile: (orderId: string) => Promise<void>
}

/**
 * Single-drain guard: the enqueue-time drain and the reconnect drain can fire concurrently
 * (tap arrive exactly as the hub reconnects). Two loops peeking the same head would double-send;
 * server idempotency keeps it correct but produces spurious InFlight churn. Serialize them by
 * chaining — a new drain waits for the in-flight one to finish, then runs fresh so a just-enqueued
 * item is still attempted in the caller's own drain.
 */
let drainChain: Promise<void> = Promise.resolve()

/**
 * Drains the transition queue FIFO.
 *
 * For each head item: attempt send, then
 *  - dequeue  → remove + continue to the next item,
 *  - keep     → STOP (preserve FIFO order; retry the same head on the next reconnect),
 *  - reconcile→ drop ALL of that order's queued items, reconcile once, then continue.
 *
 * Each item carries its enqueue-time idempotency key unchanged across retries. Concurrent calls
 * are serialized (never overlapping) via a chained promise.
 */
export async function drainQueue(deps: DrainDeps): Promise<void> {
  const run = drainChain.then(() => drainQueueInternal(deps), () => drainQueueInternal(deps))
  // Keep the chain alive even if this run rejects, so the next drain still serializes after it.
  drainChain = run.then(() => undefined, () => undefined)
  return run
}

async function drainQueueInternal(deps: DrainDeps): Promise<void> {
  // Re-peek after each mutation so removeByOrderId drops are reflected.
  // Guard against unbounded loops with the current queue length.
  let guard = (await transitionQueue.peekAll()).length + 1

  while (guard-- > 0) {
    const items = await transitionQueue.peekAll()
    if (items.length === 0) return
    const head = items[0]

    let decision: ReplayDecision
    try {
      await deps.send(head)
      decision = 'dequeue'
    } catch (err) {
      decision = classifyReplayOutcome(err)
    }

    if (decision === 'keep') return

    if (decision === 'dequeue') {
      await transitionQueue.remove(head.id)
      continue
    }

    // reconcile: drop every queued item for this order, then reconcile once.
    await transitionQueue.removeByOrderId(head.orderId)
    await deps.reconcile(head.orderId)
    // guard budget: a reconcile can drop multiple items, so refresh the budget generously.
    guard = (await transitionQueue.peekAll()).length + 1
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { classifyReplayOutcome, drainQueue } from './queueReplay'
import { transitionQueue, type QueuedTransition } from './transitionQueue'
import { ApiResponseError, type ApiError } from '../../../shared/api/client'

function apiError(status: number, code?: string): ApiResponseError {
  const body: ApiError = {
    status,
    title: 'err',
    type: `https://httpstatuses.com/${status}`,
    errors: code ? [{ name: '', reason: 'r', code }] : undefined,
  }
  return new ApiResponseError(status, body)
}

describe('classifyReplayOutcome', () => {
  it('success on no error -> dequeue', () => {
    expect(classifyReplayOutcome(null)).toBe('dequeue')
  })

  it('network error (non-ApiResponseError) -> keep', () => {
    expect(classifyReplayOutcome(new TypeError('Failed to fetch'))).toBe('keep')
  })

  it('5xx -> keep (retryable)', () => {
    expect(classifyReplayOutcome(apiError(500))).toBe('keep')
    expect(classifyReplayOutcome(apiError(503))).toBe('keep')
  })

  it('409 Idempotency.InFlight -> keep (F-02: retryable, branch on CODE not status)', () => {
    expect(classifyReplayOutcome(apiError(409, 'Idempotency.InFlight'))).toBe('keep')
  })

  it('409 Idempotency.KeyReused -> drop+reconcile (definitive)', () => {
    expect(classifyReplayOutcome(apiError(409, 'Idempotency.KeyReused'))).toBe('reconcile')
  })

  it('terminal-state 409 (non-idempotency code) -> drop+reconcile', () => {
    expect(classifyReplayOutcome(apiError(409, 'Order.InvalidTransition'))).toBe('reconcile')
  })

  it('404 NotEntitled -> drop+reconcile (F-03)', () => {
    expect(classifyReplayOutcome(apiError(404))).toBe('reconcile')
  })

  it('other 4xx (400) -> drop+reconcile (definitive)', () => {
    expect(classifyReplayOutcome(apiError(400))).toBe('reconcile')
  })
})

describe('drainQueue', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory()
    await transitionQueue.reset()
    await transitionQueue.clear()
  })

  async function enqueueAll(items: { action: QueuedTransition['action']; orderId: string }[]) {
    for (const i of items) await transitionQueue.enqueue({ action: i.action, orderId: i.orderId, payload: null })
  }

  it('replays FIFO and dequeues each on success', async () => {
    await enqueueAll([
      { action: 'arrive', orderId: 'o1' },
      { action: 'start', orderId: 'o1' },
    ])
    const send = vi.fn<(item: QueuedTransition) => Promise<void>>().mockResolvedValue(undefined)
    const reconcile = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue(undefined)

    await drainQueue({ send, reconcile })

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls.map(c => c[0].action)).toEqual(['arrive', 'start'])
    expect(await transitionQueue.peekAll()).toHaveLength(0)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('preserves the SAME idempotency key across a retry', async () => {
    const item = await transitionQueue.enqueue({ action: 'arrive', orderId: 'o1', payload: null })
    const seen: string[] = []
    let calls = 0
    const send = vi.fn(async (it: QueuedTransition) => {
      seen.push(it.idempotencyKey)
      calls += 1
      if (calls === 1) throw new TypeError('offline') // first drain: network error -> keep
    })
    const reconcile = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue(undefined)

    await drainQueue({ send, reconcile }) // first pass: kept
    expect(await transitionQueue.peekAll()).toHaveLength(1)
    await drainQueue({ send, reconcile }) // second pass: succeeds
    expect(await transitionQueue.peekAll()).toHaveLength(0)

    expect(seen).toEqual([item.idempotencyKey, item.idempotencyKey])
  })

  it('stops draining after a keep (InFlight/network) to preserve FIFO', async () => {
    await enqueueAll([
      { action: 'arrive', orderId: 'o1' },
      { action: 'start', orderId: 'o1' },
    ])
    const send = vi.fn(async () => { throw new TypeError('offline') })
    const reconcile = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue(undefined)

    await drainQueue({ send, reconcile })
    // Only the head was attempted; both remain queued (FIFO not skipped).
    expect(send).toHaveBeenCalledTimes(1)
    expect(await transitionQueue.peekAll()).toHaveLength(2)
  })

  it('serializes concurrent drains (single-drain guard): the head is never sent twice', async () => {
    await transitionQueue.enqueue({ action: 'arrive', orderId: 'o1', payload: null })
    let inFlight = 0
    let maxConcurrent = 0
    const send = vi.fn(async () => {
      inFlight += 1
      maxConcurrent = Math.max(maxConcurrent, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })
    const reconcile = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue(undefined)

    // Two drains fired at once (enqueue-time + reconnect).
    await Promise.all([drainQueue({ send, reconcile }), drainQueue({ send, reconcile })])

    expect(maxConcurrent).toBe(1)       // never overlapped
    expect(send).toHaveBeenCalledTimes(1) // item already dequeued by the first drain
    expect(await transitionQueue.peekAll()).toHaveLength(0)
  })

  it('on a 409 drops ALL of that order\'s items and reconciles once', async () => {
    await enqueueAll([
      { action: 'arrive', orderId: 'o1' },
      { action: 'start', orderId: 'o1' },
      { action: 'arrive', orderId: 'o2' },
    ])
    const send = vi.fn(async (it: QueuedTransition) => {
      if (it.orderId === 'o1') throw apiError(409, 'Order.InvalidTransition')
    })
    const reconcile = vi.fn<(orderId: string) => Promise<void>>().mockResolvedValue(undefined)

    await drainQueue({ send, reconcile })

    // o1 head failed 409 -> both o1 items dropped + reconcile(o1); o2 then succeeds.
    expect(reconcile).toHaveBeenCalledWith('o1')
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(await transitionQueue.peekAll()).toHaveLength(0)
  })
})

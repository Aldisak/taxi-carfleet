import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { transitionQueue, type QueuedTransition } from './transitionQueue'

function sample(overrides: Partial<QueuedTransition> = {}): Omit<QueuedTransition, 'id' | 'idempotencyKey' | 'enqueuedAt'> {
  return {
    action: 'arrive',
    orderId: 'order-1',
    payload: null,
    ...overrides,
  }
}

describe('transitionQueue', () => {
  beforeEach(async () => {
    // Fresh IndexedDB per test.
    globalThis.indexedDB = new IDBFactory()
    await transitionQueue.reset()
    await transitionQueue.clear()
  })

  it('mints an idempotency key ONCE at enqueue time', async () => {
    const item = await transitionQueue.enqueue(sample())
    expect(item.idempotencyKey).toBeTruthy()
    expect(item.id).toBeTruthy()
    expect(item.enqueuedAt).toBeTruthy()

    const all = await transitionQueue.peekAll()
    expect(all).toHaveLength(1)
    expect(all[0].idempotencyKey).toBe(item.idempotencyKey)
  })

  it('preserves items (and their keys) across a "reload" (reopen the DB)', async () => {
    const item = await transitionQueue.enqueue(sample())
    // Simulate reload: drop the cached db handle, reopen.
    await transitionQueue.reset()
    const all = await transitionQueue.peekAll()
    expect(all).toHaveLength(1)
    expect(all[0].idempotencyKey).toBe(item.idempotencyKey)
    expect(all[0].orderId).toBe('order-1')
  })

  it('returns items in FIFO enqueue order', async () => {
    await transitionQueue.enqueue(sample({ action: 'arrive', orderId: 'o1' }))
    await transitionQueue.enqueue(sample({ action: 'start', orderId: 'o1' }))
    await transitionQueue.enqueue(sample({ action: 'complete', orderId: 'o1', payload: { finalPriceCzk: 100, paymentType: 'Cash' } }))

    const all = await transitionQueue.peekAll()
    expect(all.map(i => i.action)).toEqual(['arrive', 'start', 'complete'])
  })

  it('removes a single item by id', async () => {
    const a = await transitionQueue.enqueue(sample({ orderId: 'o1' }))
    await transitionQueue.enqueue(sample({ orderId: 'o2' }))
    await transitionQueue.remove(a.id)

    const all = await transitionQueue.peekAll()
    expect(all).toHaveLength(1)
    expect(all[0].orderId).toBe('o2')
  })

  it('removes all items for a given orderId (409 drop+reconcile)', async () => {
    await transitionQueue.enqueue(sample({ action: 'arrive', orderId: 'o1' }))
    await transitionQueue.enqueue(sample({ action: 'start', orderId: 'o1' }))
    await transitionQueue.enqueue(sample({ action: 'arrive', orderId: 'o2' }))

    await transitionQueue.removeByOrderId('o1')
    const all = await transitionQueue.peekAll()
    expect(all.map(i => i.orderId)).toEqual(['o2'])
  })

  it('clears everything', async () => {
    await transitionQueue.enqueue(sample())
    await transitionQueue.enqueue(sample())
    await transitionQueue.clear()
    expect(await transitionQueue.peekAll()).toHaveLength(0)
  })
})

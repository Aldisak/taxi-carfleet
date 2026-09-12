import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return {
    ...actual,
    postArriveOrder: vi.fn(),
    postStartOrder: vi.fn(),
    postCompleteOrder: vi.fn(),
    postDriverCancelOrder: vi.fn(),
    getOrder: vi.fn(),
  }
})

const storeSetArrivedAt = vi.fn()
const storeUpdateOrder = vi.fn()
const storeClear = vi.fn()
vi.mock('../ride/useActiveOrderStore', () => ({
  useActiveOrderStore: {
    getState: () => ({
      setArrivedAt: storeSetArrivedAt,
      updateOrder: storeUpdateOrder,
      clear: storeClear,
    }),
  },
}))

const idbClear = vi.fn()
const idbSetArrivedAt = vi.fn()
vi.mock('../ride/idbRideStore', () => ({
  idbRideStore: {
    clear: (...a: unknown[]) => idbClear(...a),
    setArrivedAt: (...a: unknown[]) => idbSetArrivedAt(...a),
  },
}))

vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useHubConnectionState: vi.fn(() => 'connected'),
}))

import {
  postArriveOrder,
  postCompleteOrder,
  getOrder,
  ApiResponseError,
} from '../../../shared/api/client'
import { enqueueAndDrainTransition } from './useTransitionQueue'
import { transitionQueue } from './transitionQueue'

const mockArrive = vi.mocked(postArriveOrder)
const mockComplete = vi.mocked(postCompleteOrder)
const mockGetOrder = vi.mocked(getOrder)

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  await transitionQueue.reset()
  await transitionQueue.clear()
  vi.clearAllMocks()
  idbClear.mockResolvedValue(undefined)
  idbSetArrivedAt.mockResolvedValue(undefined)
})

describe('enqueueAndDrainTransition', () => {
  it('online arrive: sends with the minted key, updates store, dequeues, returns success', async () => {
    mockArrive.mockResolvedValue({ order: { id: 'o1', status: 'Arrived' } as never })

    const outcome = await enqueueAndDrainTransition({ action: 'arrive', orderId: 'o1', payload: null })

    expect(outcome).toEqual({ type: 'success' })
    expect(mockArrive).toHaveBeenCalledTimes(1)
    const keyPassed = mockArrive.mock.calls[0][1]
    expect(typeof keyPassed).toBe('string')
    expect(storeUpdateOrder).toHaveBeenCalled()
    expect(storeSetArrivedAt).toHaveBeenCalled()
    expect(await transitionQueue.peekAll()).toHaveLength(0)
  })

  it('offline arrive: keeps the item queued, returns queued', async () => {
    mockArrive.mockRejectedValue(new TypeError('Failed to fetch'))

    const outcome = await enqueueAndDrainTransition({ action: 'arrive', orderId: 'o1', payload: null })

    expect(outcome).toEqual({ type: 'queued' })
    expect(await transitionQueue.peekAll()).toHaveLength(1)
  })

  it('the queued key is preserved when a later reconnect-drain retries the SAME item', async () => {
    // First attempt offline -> item kept with its minted key.
    mockArrive.mockRejectedValueOnce(new TypeError('offline'))
    await enqueueAndDrainTransition({ action: 'arrive', orderId: 'o1', payload: null })
    const [queued] = await transitionQueue.peekAll()
    const keyFirst = mockArrive.mock.calls[0][1]
    expect(queued.idempotencyKey).toBe(keyFirst)

    // Reconnect: drain the existing queue (no new enqueue) — same item, same key.
    mockArrive.mockResolvedValue({ order: { id: 'o1', status: 'Arrived' } as never })
    const { drainQueue } = await import('./queueReplay')
    const { sendTransition } = await import('./useTransitionQueue')
    await drainQueue({ send: sendTransition, reconcile: async () => {} })

    expect(await transitionQueue.peekAll()).toHaveLength(0)
    const keySecond = mockArrive.mock.calls[1][1]
    expect(keySecond).toBe(queued.idempotencyKey)
  })

  it('terminal-state 409: drops the order items + reconciles from server, returns stale', async () => {
    mockArrive.mockRejectedValue(
      new ApiResponseError(409, { status: 409, title: 'Conflict', type: 't', errors: [{ name: '', reason: 'r', code: 'Order.InvalidTransition' }] }),
    )
    mockGetOrder.mockResolvedValue({ id: 'o1', status: 'InProgress' } as never)

    const outcome = await enqueueAndDrainTransition({ action: 'arrive', orderId: 'o1', payload: null })

    expect(outcome).toEqual({ type: 'stale' })
    expect(mockGetOrder).toHaveBeenCalledWith('o1')
    expect(await transitionQueue.peekAll()).toHaveLength(0)
  })

  it('InFlight 409: keeps queued (retryable), returns queued', async () => {
    mockArrive.mockRejectedValue(
      new ApiResponseError(409, { status: 409, title: 'Conflict', type: 't', errors: [{ name: '', reason: 'r', code: 'Idempotency.InFlight' }] }),
    )

    const outcome = await enqueueAndDrainTransition({ action: 'arrive', orderId: 'o1', payload: null })

    expect(outcome).toEqual({ type: 'queued' })
    expect(mockGetOrder).not.toHaveBeenCalled()
    expect(await transitionQueue.peekAll()).toHaveLength(1)
  })

  it('complete carries the payload through', async () => {
    mockComplete.mockResolvedValue({ order: { id: 'o1', status: 'Completed' } as never })
    const payload = { finalPriceCzk: 150, paymentType: 'Cash' }

    const outcome = await enqueueAndDrainTransition({ action: 'complete', orderId: 'o1', payload })

    expect(outcome).toEqual({ type: 'success' })
    expect(mockComplete).toHaveBeenCalledWith('o1', payload, expect.any(String))
    expect(storeClear).toHaveBeenCalled()
    expect(idbClear).toHaveBeenCalled()
  })
})

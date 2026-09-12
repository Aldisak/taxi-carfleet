import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const enqueueAndDrainTransition = vi.fn()
vi.mock('../queue/useTransitionQueue', () => ({
  enqueueAndDrainTransition: (...a: unknown[]) => enqueueAndDrainTransition(...a),
}))

import { useCompleteRide } from './useCompleteRide'
import type { CompleteOrderRequest } from '../../../shared/api/client'

const req: CompleteOrderRequest = { finalPriceCzk: 150, paymentType: 'Cash' }

describe('useCompleteRide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    enqueueAndDrainTransition.mockResolvedValue({ type: 'success' })
  })

  it('delegates to the queue with action=complete + the payload, returns the outcome', async () => {
    const { result } = renderHook(() => useCompleteRide())

    let outcome
    await act(async () => { outcome = await result.current.complete('order-1', req) })

    expect(outcome).toEqual({ type: 'success' })
    expect(enqueueAndDrainTransition).toHaveBeenCalledWith({
      action: 'complete',
      orderId: 'order-1',
      payload: { finalPriceCzk: 150, paymentType: 'Cash', overrideReason: undefined },
    })
  })

  it('forwards the overrideReason into the payload when present', async () => {
    const { result } = renderHook(() => useCompleteRide())
    await act(async () => {
      await result.current.complete('order-1', { ...req, overrideReason: 'Waited 20 min' })
    })
    expect(enqueueAndDrainTransition.mock.calls[0][0].payload.overrideReason).toBe('Waited 20 min')
  })

  it('passes through a stale outcome (definitive 4xx drop+reconcile)', async () => {
    enqueueAndDrainTransition.mockResolvedValue({ type: 'stale' })
    const { result } = renderHook(() => useCompleteRide())
    let outcome
    await act(async () => { outcome = await result.current.complete('order-1', req) })
    expect(outcome).toEqual({ type: 'stale' })
  })

  it('passes through a queued outcome (offline)', async () => {
    enqueueAndDrainTransition.mockResolvedValue({ type: 'queued' })
    const { result } = renderHook(() => useCompleteRide())
    let outcome
    await act(async () => { outcome = await result.current.complete('order-1', req) })
    expect(outcome).toEqual({ type: 'queued' })
  })

  it('double-tap guard: second concurrent call is a noop with one delegation', async () => {
    let resolveFn: (v: unknown) => void = () => {}
    enqueueAndDrainTransition.mockImplementation(() => new Promise(res => { resolveFn = res }))
    const { result } = renderHook(() => useCompleteRide())

    let first: Promise<unknown> = Promise.resolve()
    let second
    await act(async () => {
      first = result.current.complete('order-1', req)
      second = await result.current.complete('order-1', req)
    })
    expect(second).toEqual({ type: 'noop' })

    await act(async () => {
      resolveFn({ type: 'success' })
      await first
    })
    expect(enqueueAndDrainTransition).toHaveBeenCalledTimes(1)
  })
})

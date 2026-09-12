import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNewOrderHighlight } from './useNewOrderHighlight'
import { useNewOrderHighlightStore } from './useCreateOrder'

describe('useNewOrderHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset the store before each test
    useNewOrderHighlightStore.getState().setHighlight(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    useNewOrderHighlightStore.getState().setHighlight(null)
  })

  it('returns false for an order that is not the highlight', () => {
    const { result } = renderHook(() => useNewOrderHighlight('order-123'))
    expect(result.current).toBe(false)
  })

  it('returns true immediately after the order is set as highlight', () => {
    const { result } = renderHook(() => useNewOrderHighlight('order-abc'))
    act(() => {
      useNewOrderHighlightStore.getState().setHighlight({
        orderId: 'order-abc',
        createdAt: Date.now(),
      })
    })
    expect(result.current).toBe(true)
  })

  it('returns false for a different order even when highlight is set', () => {
    const { result } = renderHook(() => useNewOrderHighlight('order-xyz'))
    act(() => {
      useNewOrderHighlightStore.getState().setHighlight({
        orderId: 'order-abc',
        createdAt: Date.now(),
      })
    })
    expect(result.current).toBe(false)
  })

  it('clears highlight automatically after ~3 seconds', () => {
    const { result } = renderHook(() => useNewOrderHighlight('order-abc'))
    act(() => {
      useNewOrderHighlightStore.getState().setHighlight({
        orderId: 'order-abc',
        createdAt: Date.now(),
      })
    })
    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(3100)
    })
    expect(result.current).toBe(false)
  })

  it('highlight is still active at 2.9 seconds', () => {
    const { result } = renderHook(() => useNewOrderHighlight('order-abc'))
    act(() => {
      useNewOrderHighlightStore.getState().setHighlight({
        orderId: 'order-abc',
        createdAt: Date.now(),
      })
    })
    act(() => {
      vi.advanceTimersByTime(2900)
    })
    expect(result.current).toBe(true)
  })
})

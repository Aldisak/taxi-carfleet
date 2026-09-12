import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMapHighlightStore } from './useMapHighlight'

describe('useMapHighlight — card→pin highlight', () => {
  beforeEach(() => {
    // Reset store state between tests
    useMapHighlightStore.setState({ highlightedOrderId: null })
  })

  it('initially has no highlighted order', () => {
    const { result } = renderHook(() => useMapHighlightStore())
    expect(result.current.highlightedOrderId).toBeNull()
  })

  it('highlightOrder sets the highlightedOrderId', () => {
    const { result } = renderHook(() => useMapHighlightStore())
    act(() => {
      result.current.highlightOrder('order-123')
    })
    expect(result.current.highlightedOrderId).toBe('order-123')
  })

  it('clearHighlight clears the order highlight', () => {
    const { result } = renderHook(() => useMapHighlightStore())
    act(() => {
      result.current.highlightOrder('order-abc')
      result.current.clearHighlight()
    })
    expect(result.current.highlightedOrderId).toBeNull()
  })

  it('highlighting one order replaces a previous highlight', () => {
    const { result } = renderHook(() => useMapHighlightStore())
    act(() => {
      result.current.highlightOrder('order-1')
      result.current.highlightOrder('order-2')
    })
    expect(result.current.highlightedOrderId).toBe('order-2')
  })
})

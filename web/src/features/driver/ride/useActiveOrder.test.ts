import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

let storeState: { order: unknown; arrivedAt: string | null }
vi.mock('./useActiveOrderStore', () => ({
  useActiveOrderStore: (selector: (s: unknown) => unknown) => selector(storeState),
}))

import { useActiveOrder } from './useActiveOrder'

describe('useActiveOrder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    storeState = { order: null, arrivedAt: null }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the order from the store', () => {
    storeState = { order: { id: 'o1', status: 'Accepted' }, arrivedAt: null }
    const { result } = renderHook(() => useActiveOrder())
    expect(result.current.order).toEqual({ id: 'o1', status: 'Accepted' })
  })

  it('no-show disabled before 5 minutes since arrivedAt', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    vi.setSystemTime(new Date('2026-09-12T10:02:00.000Z'))
    storeState = { order: { id: 'o1', status: 'Arrived' }, arrivedAt: arrivedAt.toISOString() }
    const { result } = renderHook(() => useActiveOrder())
    expect(result.current.noShowEnabled).toBe(false)
    expect(result.current.noShowCountdownSeconds).toBe(180)
  })

  it('no-show becomes enabled as the ticking clock crosses 5 minutes', () => {
    const arrivedAt = new Date('2026-09-12T10:00:00.000Z')
    vi.setSystemTime(new Date('2026-09-12T10:04:59.000Z'))
    storeState = { order: { id: 'o1', status: 'Arrived' }, arrivedAt: arrivedAt.toISOString() }
    const { result } = renderHook(() => useActiveOrder())
    expect(result.current.noShowEnabled).toBe(false)

    act(() => { vi.advanceTimersByTime(2000) }) // cross 5:00
    expect(result.current.noShowEnabled).toBe(true)
    expect(result.current.noShowCountdownSeconds).toBe(0)
  })

  it('no-show disabled when arrivedAt is null', () => {
    storeState = { order: { id: 'o1', status: 'Arrived' }, arrivedAt: null }
    const { result } = renderHook(() => useActiveOrder())
    expect(result.current.noShowEnabled).toBe(false)
    expect(result.current.noShowCountdownSeconds).toBeNull()
  })
})

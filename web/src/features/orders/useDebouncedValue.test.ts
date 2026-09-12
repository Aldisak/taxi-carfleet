import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('does not update the value before the delay elapses', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'hello' },
    })

    rerender({ val: 'world' })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe('hello') // still old value
  })

  it('updates the value after the delay elapses', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'hello' },
    })

    rerender({ val: 'world' })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('world')
  })

  it('resets the timer when the value changes during the delay', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'a' },
    })

    rerender({ val: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ val: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // 400ms total but timer was reset at 200ms → still not elapsed
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe('abc')
  })
})

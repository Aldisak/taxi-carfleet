import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

vi.mock('../../../shared/api/client', () => ({
  getGeoSuggest: vi.fn(),
}))

import { getGeoSuggest } from '../../../shared/api/client'
import { useSuggest } from './useSuggest'

const mockSuggest = vi.mocked(getGeoSuggest)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useSuggest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
  })

  it('does not query for fewer than 3 characters', async () => {
    const { result, rerender } = renderHook(({ q }: { q: string }) => useSuggest(q), {
      wrapper,
      initialProps: { q: 'ab' },
    })
    act(() => { vi.advanceTimersByTime(400) })
    rerender({ q: 'ab' })
    expect(mockSuggest).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
  })

  it('debounces: no call before the window elapses, one call after', async () => {
    mockSuggest.mockResolvedValue({ items: [{ label: 'Hlavní 1, Praha', lat: 50.08, lng: 14.42 }] })
    renderHook(() => useSuggest('Hlavní'), { wrapper })

    // Before the debounce window elapses, no call.
    act(() => { vi.advanceTimersByTime(200) })
    expect(mockSuggest).not.toHaveBeenCalled()

    // After it elapses, the debounced query is sent exactly once (near undefined when not supplied).
    act(() => { vi.advanceTimersByTime(200) })
    expect(mockSuggest).toHaveBeenCalledWith('Hlavní', undefined)
    expect(mockSuggest).toHaveBeenCalledTimes(1)
  })

  it('surfaces the returned items for a settled >= 3-char query', async () => {
    vi.useRealTimers()
    mockSuggest.mockResolvedValue({ items: [{ label: 'Hlavní 1, Praha', lat: 50.08, lng: 14.42 }] })
    const { result } = renderHook(() => useSuggest('Hlavní'), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0].label).toBe('Hlavní 1, Praha')
  })

  it('queries when logged out for a >= 3-char query (suggest is anonymous-by-slug, WI-1)', () => {
    mockSuggest.mockResolvedValue({ items: [] })
    localStorage.removeItem('auth.accessToken')
    renderHook(() => useSuggest('Hlavní'), { wrapper })
    act(() => { vi.advanceTimersByTime(500) })
    expect(mockSuggest).toHaveBeenCalledWith('Hlavní', undefined)
  })

  it('threads the near location into the suggest call (UC-018 WI-2)', () => {
    mockSuggest.mockResolvedValue({ items: [] })
    const near = { lat: 50.09, lng: 14.43 }
    renderHook(() => useSuggest('Hlavní', near), { wrapper })
    act(() => { vi.advanceTimersByTime(500) })
    expect(mockSuggest).toHaveBeenCalledWith('Hlavní', near)
  })

  it('re-queries when the (coarse) near changes but not on an equal-rounded near', async () => {
    vi.useRealTimers()
    mockSuggest.mockResolvedValue({ items: [] })
    const { rerender } = renderHook(({ n }: { n: { lat: number; lng: number } }) => useSuggest('Hlavní', n), {
      wrapper,
      initialProps: { n: { lat: 50.09, lng: 14.43 } },
    })
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledTimes(1))

    // A DIFFERENT coarse near → the query key changes → a second call fires (near is not debounced).
    rerender({ n: { lat: 50.12, lng: 14.5 } })
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledTimes(2))
    expect(mockSuggest).toHaveBeenLastCalledWith('Hlavní', { lat: 50.12, lng: 14.5 })

    // A fresh-but-EQUAL near object (same rounded value) hashes identically → no extra call.
    rerender({ n: { lat: 50.12, lng: 14.5 } })
    await new Promise((r) => setTimeout(r, 50))
    expect(mockSuggest).toHaveBeenCalledTimes(2)
  })

  it('still does not query for fewer than 3 characters when logged out (regression)', () => {
    localStorage.removeItem('auth.accessToken')
    renderHook(() => useSuggest('ab'), { wrapper })
    act(() => { vi.advanceTimersByTime(500) })
    expect(mockSuggest).not.toHaveBeenCalled()
  })
})

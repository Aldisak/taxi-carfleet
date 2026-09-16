import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

vi.mock('../../../shared/api/client', () => ({
  getGeoReverse: vi.fn(),
}))

import { getGeoReverse } from '../../../shared/api/client'
import { useReverseGeocode } from './useReverseGeocode'

const mockReverse = vi.mocked(getGeoReverse)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useReverseGeocode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockReverse.mockResolvedValue({
      found: true,
      label: 'Nádražní 1, Kutná Hora',
      street: 'Nádražní 1',
      municipality: 'Kutná Hora',
    })
  })

  it('does not call getGeoReverse until the debounce window elapses, then calls once with rounded coords', () => {
    renderHook(() => useReverseGeocode({ lat: 50.07553219, lng: 14.43781995 }), { wrapper })

    act(() => { vi.advanceTimersByTime(200) })
    expect(mockReverse).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(200) })
    expect(mockReverse).toHaveBeenCalledTimes(1)
    expect(mockReverse).toHaveBeenCalledWith(50.0755, 14.4378)
  })

  it('is disabled (no call) when coords are null', () => {
    renderHook(() => useReverseGeocode(null), { wrapper })
    act(() => { vi.advanceTimersByTime(500) })
    expect(mockReverse).not.toHaveBeenCalled()
  })

  it('does not thrash the cache for a tiny sub-4th-decimal move (same rounded key -> one call)', () => {
    const { rerender } = renderHook(
      ({ coords }: { coords: { lat: number; lng: number } }) => useReverseGeocode(coords),
      { wrapper, initialProps: { coords: { lat: 50.07551, lng: 14.43781 } } },
    )
    act(() => { vi.advanceTimersByTime(400) })
    expect(mockReverse).toHaveBeenCalledTimes(1)

    // A jitter smaller than the 4th decimal rounds to the same key.
    rerender({ coords: { lat: 50.075512, lng: 14.437814 } })
    act(() => { vi.advanceTimersByTime(400) })
    expect(mockReverse).toHaveBeenCalledTimes(1)
  })
})

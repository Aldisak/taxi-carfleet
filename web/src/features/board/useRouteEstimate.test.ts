import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Use partial mock so ApiResponseError class is still available
vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getGeoRoute: vi.fn(),
  }
})

import { useRouteEstimate } from './useRouteEstimate'
import * as client from '../../shared/api/client'
import { ApiResponseError } from '../../shared/api/client'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

const DEFAULT_COORDS = {
  fromLat: 50.027,
  fromLng: 15.2,
  toLat: 49.946,
  toLng: 15.267,
}

describe('useRouteEstimate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns estimatedPriceCzk when route response includes it', async () => {
    vi.mocked(client.getGeoRoute).mockResolvedValueOnce({
      distanceMeters: 15000,
      durationSeconds: 900,
      estimatedPriceCzk: 220,
    })

    const { result } = renderHook(() => useRouteEstimate(DEFAULT_COORDS), {
      wrapper: makeWrapper(),
    })

    // Advance past the debounce delay (300ms) then flush promises
    await act(async () => {
      vi.advanceTimersByTime(400)
      // Allow the async getGeoRoute to resolve
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.estimatedPriceCzk).toBe(220)
    expect(result.current.distanceMeters).toBe(15000)
  })

  it('returns null estimatedPriceCzk when server returns null (no default tariff)', async () => {
    vi.mocked(client.getGeoRoute).mockResolvedValueOnce({
      distanceMeters: 10000,
      durationSeconds: 600,
      estimatedPriceCzk: null,
    })

    const { result } = renderHook(() => useRouteEstimate(DEFAULT_COORDS), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.estimatedPriceCzk).toBeNull()
    expect(result.current.distanceMeters).toBe(10000)
  })

  it('returns absent state (null) when geo/route returns 502 — silent, not an error', async () => {
    vi.mocked(client.getGeoRoute).mockRejectedValueOnce(
      new ApiResponseError(502, {
        status: 502,
        title: 'Bad Gateway',
        type: 'https://httpstatuses.com/502',
        errors: [{ name: 'Geo.RouteUnavailable', reason: 'Route upstream unavailable', code: 'Geo.RouteUnavailable' }],
      }),
    )

    const { result } = renderHook(() => useRouteEstimate(DEFAULT_COORDS), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    // On 502, state should be absent (null) — NOT an error that blocks the form
    expect(result.current.estimatedPriceCzk).toBeNull()
    expect(result.current.distanceMeters).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('returns null when coordinates are absent', () => {
    const { result } = renderHook(
      () =>
        useRouteEstimate({
          fromLat: null,
          fromLng: null,
          toLat: null,
          toLng: null,
        }),
      { wrapper: makeWrapper() },
    )

    expect(result.current.estimatedPriceCzk).toBeNull()
    expect(result.current.distanceMeters).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('debounces calls — fires only once after the delay settles', async () => {
    vi.mocked(client.getGeoRoute).mockResolvedValue({
      distanceMeters: 10000,
      durationSeconds: 600,
      estimatedPriceCzk: 150,
    })

    const { rerender } = renderHook(
      ({ coords }: { coords: typeof DEFAULT_COORDS }) => useRouteEstimate(coords),
      {
        wrapper: makeWrapper(),
        initialProps: { coords: DEFAULT_COORDS },
      },
    )

    // Rapid rerenders before the debounce delay
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    rerender({ coords: { fromLat: 50.03, fromLng: 15.21, toLat: 49.95, toLng: 15.27 } })

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Should have been called exactly once with the final set of coords
    expect(client.getGeoRoute).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type { GeoRouteResponse } from '../../../shared/api/client'
import type { SelectedPlace } from './orderFlowState'

vi.mock('../../../shared/api/client', () => ({
  getGeoRoute: vi.fn(),
}))

import { getGeoRoute } from '../../../shared/api/client'
import { useRoute } from './useRoute'

const mockRoute = vi.mocked(getGeoRoute)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const PICKUP: SelectedPlace = { label: 'Odkud', lat: 50.08, lng: 14.42 }
const DESTINATION: SelectedPlace = { label: 'Kam', lat: 49.95, lng: 15.27 }

const ROUTE: GeoRouteResponse = {
  distanceMeters: 90000,
  durationSeconds: 4200,
  estimatedPriceCzk: 1800,
  geometry: [
    [50.08, 14.42],
    [50.0, 14.8],
    [49.95, 15.27],
  ],
}

describe('useRoute', () => {
  beforeEach(() => {
    mockRoute.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches pickup -> destination and returns the geometry when both are set', async () => {
    mockRoute.mockResolvedValue(ROUTE)

    const { result } = renderHook(() => useRoute(PICKUP, DESTINATION), { wrapper })

    await waitFor(() => expect(result.current.geometry).toEqual(ROUTE.geometry))
    expect(mockRoute).toHaveBeenCalledWith({
      fromLat: PICKUP.lat,
      fromLng: PICKUP.lng,
      toLat: DESTINATION.lat,
      toLng: DESTINATION.lng,
    })
  })

  it('does not fetch when the pickup is null (geometry null)', async () => {
    const { result } = renderHook(() => useRoute(null, DESTINATION), { wrapper })

    expect(mockRoute).not.toHaveBeenCalled()
    expect(result.current.geometry).toBeNull()
  })

  it('does not fetch when the destination is null (geometry null)', async () => {
    const { result } = renderHook(() => useRoute(PICKUP, null), { wrapper })

    expect(mockRoute).not.toHaveBeenCalled()
    expect(result.current.geometry).toBeNull()
  })

  it('re-queries when the destination coordinate changes', async () => {
    mockRoute.mockResolvedValue(ROUTE)

    const { result, rerender } = renderHook(
      ({ dest }: { dest: SelectedPlace }) => useRoute(PICKUP, dest),
      { wrapper, initialProps: { dest: DESTINATION } },
    )

    await waitFor(() => expect(result.current.geometry).toEqual(ROUTE.geometry))
    expect(mockRoute).toHaveBeenCalledTimes(1)

    const otherDest: SelectedPlace = { label: 'Jinam', lat: 49.5, lng: 15.9 }
    rerender({ dest: otherDest })

    await waitFor(() =>
      expect(mockRoute).toHaveBeenLastCalledWith({
        fromLat: PICKUP.lat,
        fromLng: PICKUP.lng,
        toLat: otherDest.lat,
        toLng: otherDest.lng,
      }),
    )
    expect(mockRoute).toHaveBeenCalledTimes(2)
  })

  it('degrades to geometry null when getGeoRoute throws (best-effort, never blocks ordering)', async () => {
    mockRoute.mockRejectedValue(new Error('Geo.RouteUnavailable'))

    const { result } = renderHook(() => useRoute(PICKUP, DESTINATION), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.geometry).toBeNull()
  })
})

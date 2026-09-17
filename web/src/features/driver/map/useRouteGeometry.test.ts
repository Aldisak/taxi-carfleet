import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { GeoRouteResponse } from '../../../shared/api/client'
import type { RouteLeg } from '../ride/routeLeg'

// Mock the api client so the hook never hits the network (web-testing.md#network-mocking).
vi.mock('../../../shared/api/client', () => ({
  getGeoRoute: vi.fn(),
}))

import { getGeoRoute } from '../../../shared/api/client'
import { useRouteGeometry } from './useRouteGeometry'

const ORDER = {
  pickupLat: 49.95,
  pickupLng: 15.27,
  dropoffLat: 49.9,
  dropoffLng: 15.2,
}
const OWN = { lat: 50.0, lng: 15.0 }

const ROUTE: GeoRouteResponse = {
  distanceMeters: 5000,
  durationSeconds: 600,
  estimatedPriceCzk: null,
  geometry: [
    [50.0, 15.0],
    [49.97, 15.13],
    [49.95, 15.27],
  ],
}

describe('useRouteGeometry', () => {
  beforeEach(() => {
    vi.mocked(getGeoRoute).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the leg endpoint route (toPickup) and returns geometry + duration', async () => {
    vi.mocked(getGeoRoute).mockResolvedValue(ROUTE)

    const { result } = renderHook(() =>
      useRouteGeometry({ leg: 'toPickup', own: OWN, order: ORDER }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(getGeoRoute).toHaveBeenCalledWith({
      fromLat: OWN.lat,
      fromLng: OWN.lng,
      toLat: ORDER.pickupLat,
      toLng: ORDER.pickupLng,
    })
    expect(result.current.geometry).toEqual(ROUTE.geometry)
    expect(result.current.durationSeconds).toBe(600)
  })

  it('does not fetch when the leg is null (geometry null)', async () => {
    const { result } = renderHook(() =>
      useRouteGeometry({ leg: null, own: OWN, order: ORDER }),
    )

    expect(getGeoRoute).not.toHaveBeenCalled()
    expect(result.current.geometry).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('does not fetch when own position is missing', async () => {
    const { result } = renderHook(() =>
      useRouteGeometry({ leg: 'toPickup', own: null, order: ORDER }),
    )

    expect(getGeoRoute).not.toHaveBeenCalled()
    expect(result.current.geometry).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('degrades silently to geometry null when getGeoRoute throws (502)', async () => {
    vi.mocked(getGeoRoute).mockRejectedValue(new Error('Geo.RouteUnavailable'))

    const { result } = renderHook(() =>
      useRouteGeometry({ leg: 'toPickup', own: OWN, order: ORDER }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.geometry).toBeNull()
    expect(result.current.durationSeconds).toBeNull()
  })

  it('refetches with the new endpoint when the leg changes toPickup -> toDropoff', async () => {
    vi.mocked(getGeoRoute).mockResolvedValue(ROUTE)

    const { result, rerender } = renderHook(
      ({ leg }: { leg: RouteLeg }) => useRouteGeometry({ leg, own: OWN, order: ORDER }),
      { initialProps: { leg: 'toPickup' as RouteLeg } },
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getGeoRoute).toHaveBeenLastCalledWith({
      fromLat: OWN.lat,
      fromLng: OWN.lng,
      toLat: ORDER.pickupLat,
      toLng: ORDER.pickupLng,
    })

    rerender({ leg: 'toDropoff' as RouteLeg })

    await waitFor(() =>
      expect(getGeoRoute).toHaveBeenLastCalledWith({
        fromLat: OWN.lat,
        fromLng: OWN.lng,
        toLat: ORDER.dropoffLat,
        toLng: ORDER.dropoffLng,
      }),
    )
    expect(getGeoRoute).toHaveBeenCalledTimes(2)
  })
})

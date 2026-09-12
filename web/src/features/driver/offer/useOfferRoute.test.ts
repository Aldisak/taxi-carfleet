import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>('../../../shared/api/client')
  return {
    ...actual,
    getGeoRoute: vi.fn(),
  }
})

import { getGeoRoute } from '../../../shared/api/client'
import { useOfferRoute } from './useOfferRoute'

const mockGetGeoRoute = vi.mocked(getGeoRoute)

function mockGeolocation(
  lat: number,
  lng: number,
  fail?: GeolocationPositionError | null,
) {
  const mock = {
    getCurrentPosition: vi.fn((
      successCb: PositionCallback,
      errorCb?: PositionErrorCallback | null,
    ) => {
      if (fail) {
        errorCb?.(fail)
      } else {
        successCb({
          coords: {
            latitude: lat,
            longitude: lng,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition)
      }
    }),
  }
  vi.stubGlobal('navigator', { ...navigator, geolocation: mock })
  return mock
}

describe('useOfferRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches geo/route and returns distanceMeters + durationSeconds', async () => {
    mockGeolocation(50.0, 14.0)
    mockGetGeoRoute.mockResolvedValueOnce({
      distanceMeters: 1500,
      durationSeconds: 180,
      estimatedPriceCzk: null,
    })

    const { result } = renderHook(() => useOfferRoute(50.1, 14.1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.distanceMeters).toBe(1500)
    expect(result.current.durationSeconds).toBe(180)
  })

  it('returns nulls when geolocation permission is denied', async () => {
    const posError = { code: 1, message: 'PERMISSION_DENIED' } as GeolocationPositionError
    mockGeolocation(0, 0, posError)

    const { result } = renderHook(() => useOfferRoute(50.1, 14.1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.distanceMeters).toBeNull()
    expect(result.current.durationSeconds).toBeNull()
    expect(mockGetGeoRoute).not.toHaveBeenCalled()
  })

  it('returns nulls when geo/route API call fails', async () => {
    mockGeolocation(50.0, 14.0)
    mockGetGeoRoute.mockRejectedValueOnce(new Error('API error'))

    const { result } = renderHook(() => useOfferRoute(50.1, 14.1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.distanceMeters).toBeNull()
    expect(result.current.durationSeconds).toBeNull()
  })

  it('returns nulls when geolocation API is absent', async () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined })

    const { result } = renderHook(() => useOfferRoute(50.1, 14.1))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.distanceMeters).toBeNull()
    expect(result.current.durationSeconds).toBeNull()
  })
})

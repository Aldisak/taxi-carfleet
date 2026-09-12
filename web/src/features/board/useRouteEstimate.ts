import { useState, useEffect } from 'react'
import { getGeoRoute } from '../../shared/api/client'
import type { GeoRouteResponse } from '../../shared/api/client'

export interface RouteCoords {
  fromLat: number | null
  fromLng: number | null
  toLat: number | null
  toLng: number | null
}

export interface RouteEstimateState {
  distanceMeters: number | null
  durationSeconds: number | null
  estimatedPriceCzk: number | null
  isLoading: boolean
}

const DEBOUNCE_MS = 300

/**
 * Fetches a route estimate from GET /geo/route when both pickup and dropoff
 * coordinates are present. Debounced by DEBOUNCE_MS.
 *
 * F-03: renders estimatedPriceCzk directly from the server — no client-side tariff math.
 * When geo/route returns 502, or when estimatedPriceCzk is null (no default tariff),
 * the result is absent (null) — NOT an error. The form is never blocked by this.
 */
export function useRouteEstimate(coords: RouteCoords): RouteEstimateState {
  const [state, setState] = useState<RouteEstimateState>({
    distanceMeters: null,
    durationSeconds: null,
    estimatedPriceCzk: null,
    isLoading: false,
  })

  const hasCoords =
    coords.fromLat !== null &&
    coords.fromLng !== null &&
    coords.toLat !== null &&
    coords.toLng !== null

  useEffect(() => {
    if (!hasCoords) {
      setState({
        distanceMeters: null,
        durationSeconds: null,
        estimatedPriceCzk: null,
        isLoading: false,
      })
      return
    }

    let cancelled = false

    setState(prev => ({ ...prev, isLoading: true }))

    const timer = setTimeout(async () => {
      if (cancelled) return

      try {
        const result: GeoRouteResponse = await getGeoRoute({
          fromLat: coords.fromLat!,
          fromLng: coords.fromLng!,
          toLat: coords.toLat!,
          toLng: coords.toLng!,
        })

        if (!cancelled) {
          setState({
            distanceMeters: result.distanceMeters,
            durationSeconds: result.durationSeconds,
            estimatedPriceCzk: result.estimatedPriceCzk,
            isLoading: false,
          })
        }
      } catch {
        // Geo/route 502 or any network error → silent absent state, never block the form
        if (!cancelled) {
          setState({
            distanceMeters: null,
            durationSeconds: null,
            estimatedPriceCzk: null,
            isLoading: false,
          })
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.fromLat, coords.fromLng, coords.toLat, coords.toLng, hasCoords])

  return state
}

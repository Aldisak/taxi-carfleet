import { useState, useEffect } from 'react'
import { getGeoRoute } from '../../../shared/api/client'
import { legEndpoint, type LegEndpointOrder, type RouteLeg } from '../ride/routeLeg'
import type { LatLng } from '../../../shared/map/mapCamera'

/** Inputs the route-geometry hook reads. */
export interface UseRouteGeometryInput {
  /** The active route leg to draw, or null when no leg applies (selectRouteLeg output). */
  leg: RouteLeg
  /** The driver's own current position, or null before the first fix. */
  own: LatLng | null
  /** The active order's endpoint coordinates (legEndpoint resolves the leg target from these). */
  order: LegEndpointOrder
}

/** What the route-geometry hook returns. */
export interface UseRouteGeometryResult {
  /** The route polyline as [lat, lng] pairs (max 200 points), or null when unavailable / no leg. */
  geometry: number[][] | null
  /** The route duration in seconds, or null when unavailable / no leg. */
  durationSeconds: number | null
  /** True while a fetch for the current leg is in flight. */
  isLoading: boolean
}

/**
 * Eager (NO leaflet) hook that fetches the fastest-route geometry for the active leg.
 *
 * Given the current leg + the driver's own position + the order, it resolves the leg endpoint
 * (legEndpoint, WI-1) and calls POST /geo/route (own → endpoint), returning the drawn polyline
 * geometry + ETA. It keeps the geo/route call in eager, unit-testable code so the lazy
 * DriverMapInner only renders what it is handed (rules/web-performance.md#code-splitting).
 *
 * - Skips the fetch entirely when leg is null or own / the endpoint is missing.
 * - Refetches when the leg endpoint changes (status change) — the effect keys on the primitive
 *   coordinates (own + endpoint), not object identity, so a fresh `own` object each render does
 *   not storm the API (mirrors useOfferRoute's [pickupLat, pickupLng] deps).
 * - Degrades silently on a getGeoRoute throw (502 Geo.RouteUnavailable) → geometry null; the map
 *   still shows the markers.
 */
export function useRouteGeometry({
  leg,
  own,
  order,
}: UseRouteGeometryInput): UseRouteGeometryResult {
  const end = legEndpoint(leg, order)
  const shouldFetch = leg !== null && own !== null && end !== null

  const [result, setResult] = useState<UseRouteGeometryResult>({
    geometry: null,
    durationSeconds: null,
    isLoading: shouldFetch,
  })

  const ownLat = own?.lat
  const ownLng = own?.lng
  const endLat = end?.lat
  const endLng = end?.lng

  useEffect(() => {
    if (!shouldFetch || ownLat == null || ownLng == null || endLat == null || endLng == null) {
      setResult({ geometry: null, durationSeconds: null, isLoading: false })
      return
    }

    let cancelled = false
    setResult((prev) => ({ ...prev, isLoading: true }))

    getGeoRoute({ fromLat: ownLat, fromLng: ownLng, toLat: endLat, toLng: endLng })
      .then((route) => {
        if (cancelled) return
        setResult({
          geometry: route.geometry ?? null,
          durationSeconds: route.durationSeconds,
          isLoading: false,
        })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ geometry: null, durationSeconds: null, isLoading: false })
      })

    return () => {
      cancelled = true
    }
  }, [leg, shouldFetch, ownLat, ownLng, endLat, endLng])

  return result
}

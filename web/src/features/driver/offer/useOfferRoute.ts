import { useState, useEffect } from 'react'
import { getGeoRoute, type GeoRouteResponse } from '../../../shared/api/client'

export interface OfferRouteResult {
  distanceMeters: number | null
  durationSeconds: number | null
  isLoading: boolean
}

/**
 * Computes distance and ETA from the driver's current GPS position to the pickup.
 *
 * Uses one-shot `navigator.geolocation.getCurrentPosition` (feature-detected).
 * On position unavailable or permission denied, returns nulls gracefully.
 * Then calls GET /geo/route with the driver pos → pickup.
 *
 * @param pickupLat  Pickup latitude from the order DTO.
 * @param pickupLng  Pickup longitude from the order DTO.
 */
export function useOfferRoute(pickupLat: number, pickupLng: number): OfferRouteResult {
  const [result, setResult] = useState<OfferRouteResult>({
    distanceMeters: null,
    durationSeconds: null,
    isLoading: true,
  })

  useEffect(() => {
    let cancelled = false

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setResult({ distanceMeters: null, durationSeconds: null, isLoading: false })
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return
        try {
          const route: GeoRouteResponse = await getGeoRoute({
            fromLat: pos.coords.latitude,
            fromLng: pos.coords.longitude,
            toLat: pickupLat,
            toLng: pickupLng,
          })
          if (!cancelled) {
            setResult({
              distanceMeters: route.distanceMeters,
              durationSeconds: route.durationSeconds,
              isLoading: false,
            })
          }
        } catch {
          if (!cancelled) {
            setResult({ distanceMeters: null, durationSeconds: null, isLoading: false })
          }
        }
      },
      () => {
        // Permission denied or unavailable — degrade gracefully
        if (!cancelled) {
          setResult({ distanceMeters: null, durationSeconds: null, isLoading: false })
        }
      },
      { timeout: 5000, maximumAge: 30_000 },
    )

    return () => { cancelled = true }
  }, [pickupLat, pickupLng])

  return result
}

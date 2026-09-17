import { useQuery } from '@tanstack/react-query'
import { getGeoRoute } from '../../../shared/api/client'
import type { SelectedPlace } from './orderFlowState'

/** What the customer route-preview hook returns. */
export interface UseRouteResult {
  /** The fastest-route polyline as [lat, lng] pairs, or null when unavailable / inputs missing. */
  geometry: number[][] | null
  /** True while the route fetch is in flight. */
  isLoading: boolean
}

/**
 * Fetches the fastest pickup → destination route for the customer order preview (route-preview-gps).
 *
 * TanStack-cached, keyed on the PRIMITIVE coordinates so a fresh SelectedPlace object each render
 * never re-queries (mirrors useReverseGeocode's coord-keyed query and useRouteGeometry's contract).
 * The query is enabled only when BOTH pickup and destination are set — by which point the pickup is
 * frozen (MapOrderPage's destinationSet phase guard), so the key is already stable and no coord
 * rounding is needed. Best-effort: `retry: false` + TanStack's default `throwOnError: false` mean a
 * 502 Geo.RouteUnavailable settles once to geometry null and NEVER throws — the order button is
 * never gated on the route line (rules/web-realtime.md / #error-handling: a preview is not a
 * mutation).
 */
export function useRoute(
  pickup: SelectedPlace | null,
  destination: SelectedPlace | null,
): UseRouteResult {
  const enabled = pickup !== null && destination !== null

  const query = useQuery({
    queryKey: [
      'geo',
      'route',
      pickup?.lat ?? null,
      pickup?.lng ?? null,
      destination?.lat ?? null,
      destination?.lng ?? null,
    ],
    queryFn: () =>
      getGeoRoute({
        fromLat: pickup!.lat,
        fromLng: pickup!.lng,
        toLat: destination!.lat,
        toLng: destination!.lng,
      }),
    enabled,
    retry: false,
    staleTime: 60_000,
  })

  return {
    geometry: query.data?.geometry ?? null,
    isLoading: query.isLoading && enabled,
  }
}

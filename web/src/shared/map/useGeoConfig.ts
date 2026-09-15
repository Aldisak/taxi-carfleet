import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getGeoConfig, type GeoConfigResponse } from '../api/client'

/** TanStack Query key for the per-fleet Mapy tile configuration. */
export const GEO_CONFIG_QUERY_KEY = ['geo', 'config'] as const

/**
 * Loads the fleet's Mapy tile configuration (tile template, browser key, attribution, center/zoom)
 * from GET geo/config. The config is per-fleet and near-immutable (backend sends Cache-Control 7d),
 * so it is cached with a long staleTime and never refetched on focus. All three role apps share this
 * one query via the ['geo','config'] key — MapyMap consumes it internally.
 */
export function useGeoConfig(): UseQueryResult<GeoConfigResponse> {
  return useQuery({
    queryKey: GEO_CONFIG_QUERY_KEY,
    queryFn: getGeoConfig,
    staleTime: 24 * 60 * 60 * 1000, // 24 h — config changes almost never
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days, matching the server Cache-Control
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

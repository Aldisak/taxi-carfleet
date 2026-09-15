import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getGeoUsage, type GeoUsageResponse } from '../../../shared/api/client'

/** TanStack Query key for the current fleet's month-to-date geo credit usage. */
export const GEO_USAGE_QUERY_KEY = ['settings', 'geo-usage'] as const

/**
 * Loads the current fleet's month-to-date geo API credit usage + budget from GET
 * settings/geo-usage (UC-010 WI-12, FleetAdmin only). Consumed by the Settings credits panel
 * (GeoUsagePanel). Usage changes slowly, so it is cached with a short staleTime and not
 * refetched on focus (rules/web-performance.md#query-keys).
 */
export function useGeoUsage(): UseQueryResult<GeoUsageResponse> {
  return useQuery({
    queryKey: GEO_USAGE_QUERY_KEY,
    queryFn: getGeoUsage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

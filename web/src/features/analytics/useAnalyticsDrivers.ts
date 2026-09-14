/**
 * TanStack Query hook for the analytics drivers endpoint.
 */

import { useQuery } from '@tanstack/react-query'
import { getAnalyticsDrivers } from '../../shared/api/client'
import type { AnalyticsDriversParams, AnalyticsDriversResponse } from '../../shared/api/client'

/** Fetches the driver league table, retention series, and optional prior period. */
export function useAnalyticsDrivers(params: AnalyticsDriversParams) {
  return useQuery<AnalyticsDriversResponse>({
    queryKey: ['analytics', 'drivers', params],
    queryFn: () => getAnalyticsDrivers(params),
  })
}

import { useQuery } from '@tanstack/react-query'
import { getAnalyticsOverview } from '../../shared/api/client'
import type { AnalyticsOverviewParams, AnalyticsOverviewResponse } from '../../shared/api/client'

/**
 * TanStack Query hook for GET /api/v1/analytics/overview.
 * Cache key: ['analytics', 'overview', params].
 */
export function useAnalyticsOverview(params: AnalyticsOverviewParams) {
  return useQuery<AnalyticsOverviewResponse>({
    queryKey: ['analytics', 'overview', params],
    queryFn: () => getAnalyticsOverview(params),
  })
}

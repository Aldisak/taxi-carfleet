import { useQuery } from '@tanstack/react-query'
import { getAnalyticsRevenue } from '../../shared/api/client'
import type { AnalyticsRevenueParams, AnalyticsRevenueResponse } from '../../shared/api/client'

/** TanStack Query hook for GET /api/v1/analytics/revenue. */
export function useAnalyticsRevenue(params: AnalyticsRevenueParams) {
  return useQuery<AnalyticsRevenueResponse>({
    queryKey: ['analytics', 'revenue', params],
    queryFn: () => getAnalyticsRevenue(params),
  })
}

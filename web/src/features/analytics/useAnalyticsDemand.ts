import { useQuery } from '@tanstack/react-query'
import { getAnalyticsDemand } from '../../shared/api/client'
import type { AnalyticsDemandParams, AnalyticsDemandResponse } from '../../shared/api/client'

/**
 * TanStack Query hook for GET /api/v1/analytics/demand.
 *
 * Cache key: ['analytics', 'demand', params]
 */
export function useAnalyticsDemand(params: AnalyticsDemandParams) {
  return useQuery<AnalyticsDemandResponse>({
    queryKey: ['analytics', 'demand', params],
    queryFn: () => getAnalyticsDemand(params),
  })
}

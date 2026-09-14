import { useQuery } from '@tanstack/react-query'
import { getAnalyticsOperations } from '../../shared/api/client'
import type { AnalyticsOperationsParams, AnalyticsOperationsResponse } from '../../shared/api/client'

/** TanStack Query hook for GET /api/v1/analytics/operations. */
export function useAnalyticsOperations(params: AnalyticsOperationsParams) {
  return useQuery<AnalyticsOperationsResponse>({
    queryKey: ['analytics', 'operations', params],
    queryFn: () => getAnalyticsOperations(params),
  })
}

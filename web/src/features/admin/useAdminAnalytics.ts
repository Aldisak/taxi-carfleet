import { useQuery } from '@tanstack/react-query'
import { getAdminAnalytics } from '../../shared/api/client'
import type { AdminAnalyticsResponse } from '../../shared/api/client'

/**
 * TanStack Query hook for GET /api/v1/admin/analytics (SuperAdmin platform view).
 * Cache key: ['admin', 'analytics'].
 */
export function useAdminAnalytics() {
  return useQuery<AdminAnalyticsResponse>({
    queryKey: ['admin', 'analytics'],
    queryFn: getAdminAnalytics,
    staleTime: 30_000,
    retry: false,
  })
}

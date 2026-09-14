/**
 * TanStack Query hook for the analytics customers endpoint.
 */

import { useQuery } from '@tanstack/react-query'
import { getAnalyticsCustomers } from '../../shared/api/client'
import type { AnalyticsCustomersParams, AnalyticsCustomersResponse } from '../../shared/api/client'

/** Fetches customer behaviour analytics: new vs returning, frequency, cohort, top customers, ratings. */
export function useAnalyticsCustomers(params: AnalyticsCustomersParams) {
  return useQuery<AnalyticsCustomersResponse>({
    queryKey: ['analytics', 'customers', params],
    queryFn: () => getAnalyticsCustomers(params),
  })
}

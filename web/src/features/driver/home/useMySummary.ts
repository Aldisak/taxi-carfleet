import { useQuery } from '@tanstack/react-query'
import { getDriverMySummary } from '../../../shared/api/client'

/**
 * Fetches today's driver summary chips (rides/cash/card/hours online).
 * Refetch interval: 60s.
 */
export function useMySummary() {
  return useQuery({
    queryKey: ['driver', 'summary', 'today'],
    queryFn: () => getDriverMySummary(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

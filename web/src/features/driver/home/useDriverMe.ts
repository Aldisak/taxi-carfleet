import { useQuery } from '@tanstack/react-query'
import { getDriverMe } from '../../../shared/api/client'

/**
 * Fetches the driver's own profile and current shift state.
 * Refetch interval: 30s to keep status fresh in the background.
 */
export function useDriverMe() {
  return useQuery({
    queryKey: ['driver', 'me'],
    queryFn: () => getDriverMe(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getOrders } from '../../shared/api/client'
import { buildOrdersParams, type OrderFilterState } from './orderFilters'

/**
 * Fetches orders from GET /orders filtered by the provided filter state.
 * The default date range is today (local day).
 */
export function useOrderSearch(filters: OrderFilterState) {
  const params = buildOrdersParams(filters)

  return useQuery({
    queryKey: ['orders', 'search', params],
    queryFn: () => getOrders(params),
    staleTime: 30_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getDriverMyOrders, type MyOrder } from '../../../shared/api/client'

/**
 * Fetches the driver's own rides (completed + active) for a given day.
 *
 * Unwraps the { orders } envelope via select so consumers get a plain MyOrder[]
 * (the laneB11 CreateOrderResponse-shape trap: the API returns a wrapped object).
 * Query key is hierarchical and keyed by date so each day caches independently.
 */
export function useMyOrders(date: string) {
  return useQuery<{ orders: MyOrder[] }, Error, MyOrder[]>({
    queryKey: ['driver', 'orders', date],
    queryFn: () => getDriverMyOrders(date),
    select: data => data.orders,
    staleTime: 30_000,
  })
}

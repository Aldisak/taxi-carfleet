import { useQuery } from '@tanstack/react-query'
import { getMyOrderHistory, type MyOrderHistoryItemDto } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'

/** Result of {@link useMyOrderHistory}. */
export interface UseMyOrderHistoryResult {
  items: MyOrderHistoryItemDto[]
  total: number
  isLoading: boolean
  isError: boolean
}

/**
 * Loads the customer's order history (GET orders/mine, first page) for the /customer/history screen.
 * Gated on a stored token (history is inherently logged-in; an ungated read from a fresh visitor
 * would 401 → silent-refresh → redirect, mirroring useMyActiveOrder). Shares the canonical
 * ['orders','mine','list', page] query key with useRateOrder so the rating lookup and the history
 * list reuse one cache (rules/web-performance.md#query-keys). Reads keep working from cache while
 * offline (the page shows a banner, not a blank screen).
 */
export function useMyOrderHistory(): UseMyOrderHistoryResult {
  const hasToken = authStorage.getAccessToken() !== null

  const { data, isLoading, isError } = useQuery({
    queryKey: ['orders', 'mine', 'list', 1],
    queryFn: () => getMyOrderHistory(1, 20),
    enabled: hasToken,
    staleTime: 15_000,
  })

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading: hasToken && isLoading,
    isError,
  }
}

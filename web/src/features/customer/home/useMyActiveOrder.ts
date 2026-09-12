import { useQuery } from '@tanstack/react-query'
import { getMyActiveOrder, type MyActiveOrderDto } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'

/** Result of useMyActiveOrder. */
export interface UseMyActiveOrderResult {
  activeOrder: MyActiveOrderDto | null
  isLoading: boolean
}

/**
 * Loads the caller's single active order for the Home sticky banner (GET orders/mine/active).
 * Gated on a stored token: active-order is inherently logged-in, and an ungated read from a
 * fresh visitor would 401 → silentRefresh → hard redirect to /c/login (advisor). Returns
 * null when there is no active order (204) or the customer is logged out.
 *
 * Query key is hierarchical: ['orders','mine','active'] (rules/web-performance.md#query-keys).
 */
export function useMyActiveOrder(): UseMyActiveOrderResult {
  const hasToken = authStorage.getAccessToken() !== null

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 'mine', 'active'],
    queryFn: () => getMyActiveOrder(),
    enabled: hasToken,
    staleTime: 15_000,
  })

  return {
    activeOrder: data ?? null,
    isLoading: hasToken && isLoading,
  }
}

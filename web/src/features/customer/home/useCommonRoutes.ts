import { useQuery } from '@tanstack/react-query'
import { getCommonRoutes, type CommonRouteDto } from '../../../shared/api/client'

/** Result of useCommonRoutes. */
export interface UseCommonRoutesResult {
  routes: CommonRouteDto[]
  isLoading: boolean
}

/**
 * Loads valid-now common routes for the Home cards (GET routes/common).
 *
 * AC#1 reconciliation (laneA4b): routes/common is now AllowAnonymous — it needs only the
 * X-Fleet-Slug header (client.ts auto-attaches it from authStorage, persisted by B-pwa).
 * A fresh LOGGED-OUT visitor MUST see the route cards (AC#1), so this query is NO LONGER
 * gated on a stored token (the previous hasToken gate would hide routes from first-time
 * visitors). useMyActiveOrder stays token-gated — the active order is per-customer and a
 * logged-out visitor has none.
 *
 * Query key is hierarchical: ['routes','common'] (rules/web-performance.md#query-keys).
 */
export function useCommonRoutes(): UseCommonRoutesResult {
  const { data, isLoading } = useQuery({
    queryKey: ['routes', 'common'],
    queryFn: () => getCommonRoutes(),
    staleTime: 60_000,
  })

  return {
    routes: data ?? [],
    isLoading,
  }
}

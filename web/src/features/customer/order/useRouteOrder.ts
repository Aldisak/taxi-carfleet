import { useLocation, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { CommonRouteDto } from '../../../shared/api/client'

/** Result of useRouteOrder: the resolved route for the confirm screen, or null. */
export interface UseRouteOrderResult {
  route: CommonRouteDto | null
  routeId: string | undefined
}

/**
 * Resolves the route for the /customer/order/route/:routeId confirm screen. Prefers the route
 * passed in nav-state from the Home card (no extra fetch). Falls back to the
 * ['routes','common'] query cache for a soft refresh where state survives.
 *
 * PRE-06 limitation (flagged): there is no route-detail endpoint, so a cold deep-link /
 * hard refresh with neither nav-state nor a warm cache cannot recover the route — the
 * page redirects to /c in that case.
 */
export function useRouteOrder(): UseRouteOrderResult {
  const { routeId } = useParams<{ routeId: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()

  const stateRoute = (location.state as { route?: CommonRouteDto } | null)?.route ?? null
  if (stateRoute && stateRoute.id === routeId) {
    return { route: stateRoute, routeId }
  }

  const cached = queryClient.getQueryData<CommonRouteDto[]>(['routes', 'common'])
  const fromCache = cached?.find(r => r.id === routeId) ?? null

  return { route: fromCache, routeId }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createRoute,
  deleteRoute,
  getRoutes,
  setRouteEnabled,
  setRoutePriority,
  updateRoute,
} from '../../../../shared/api/client'
import type { CreateRouteRequest, UpdateRouteRequest } from '../../../../shared/api/client'

/** Hierarchical query key for the fleet's ADMIN routes (distinct from getCommonRoutes). */
const ROUTES_ADMIN_KEY = ['routes', 'admin'] as const

/** Loads the fleet's admin routes (FleetAdmin), ordered by priority desc. */
export function useRoutes() {
  return useQuery({
    queryKey: ROUTES_ADMIN_KEY,
    queryFn: getRoutes,
    staleTime: 30_000,
  })
}

/** Creates a route and refreshes the list (create returns only the id). */
export function useCreateRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateRouteRequest) => createRoute(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROUTES_ADMIN_KEY })
    },
  })
}

/** Updates a route and refreshes the list. */
export function useUpdateRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateRouteRequest }) => updateRoute(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROUTES_ADMIN_KEY })
    },
  })
}

/** Soft-deletes a route and refreshes the list. */
export function useDeleteRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (routeId: string) => deleteRoute(routeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROUTES_ADMIN_KEY })
    },
  })
}

/** Toggles a route's enabled flag and refreshes the list. */
export function useSetRouteEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) => setRouteEnabled(id, isEnabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROUTES_ADMIN_KEY })
    },
  })
}

/** Sets a route's priority and refreshes the list. */
export function useSetRoutePriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: number }) => setRoutePriority(id, priority),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROUTES_ADMIN_KEY })
    },
  })
}

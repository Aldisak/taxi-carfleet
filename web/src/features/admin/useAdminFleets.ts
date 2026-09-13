import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminFleets,
  postCreateFleet,
  postDeactivateFleet,
} from '../../shared/api/client'
import type { CreateFleetRequest, CreateFleetResponse } from '../../shared/api/client'

/** GET /admin/fleets — all fleets across tenants (SuperAdmin). */
export function useAdminFleets() {
  return useQuery({
    queryKey: ['admin', 'fleets'],
    queryFn: getAdminFleets,
    staleTime: 30_000,
    retry: false,
  })
}

/** POST /admin/fleets — create a fleet; the caller surfaces the one-time password. */
export function useCreateFleet() {
  const queryClient = useQueryClient()
  return useMutation<CreateFleetResponse, Error, CreateFleetRequest>({
    mutationFn: (req: CreateFleetRequest) => postCreateFleet(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'fleets'] })
    },
  })
}

/** POST /admin/fleets/{id}/deactivate — SuperAdmin deactivates a fleet. */
export function useDeactivateFleet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => postDeactivateFleet(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'fleets'] })
    },
  })
}

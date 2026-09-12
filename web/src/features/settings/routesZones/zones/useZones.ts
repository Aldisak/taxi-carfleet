import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createZone, deleteZone, getZones, updateZone } from '../../../../shared/api/client'
import type { CreateZoneRequest, UpdateZoneRequest } from '../../../../shared/api/client'

/** Hierarchical query key for the fleet's zones (rules/web-performance.md#query-keys). */
const ZONES_KEY = ['zones'] as const

/** Loads the fleet's zones (FleetAdmin). */
export function useZones() {
  return useQuery({
    queryKey: ZONES_KEY,
    queryFn: getZones,
    staleTime: 30_000,
  })
}

/** Creates a zone and refreshes the list. */
export function useCreateZone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateZoneRequest) => createZone(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY })
    },
  })
}

/** Updates a zone and refreshes the list. */
export function useUpdateZone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateZoneRequest }) => updateZone(id, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY })
    },
  })
}

/** Deletes a zone and refreshes the list. */
export function useDeleteZone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (zoneId: string) => deleteZone(zoneId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ZONES_KEY })
    },
  })
}

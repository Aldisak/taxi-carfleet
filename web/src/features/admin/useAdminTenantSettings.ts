import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAdminTenantSettings, putAdminTenantSettings } from '../../shared/api/client'
import type {
  AdminTenantSettingsDto,
  UpdateAdminTenantSettingsRequest,
} from '../../shared/api/client'

/** GET /admin/fleets/{id}/settings — a tenant's full settings (SuperAdmin). */
export function useAdminTenantSettings(fleetId: string) {
  return useQuery({
    queryKey: ['admin', 'fleets', fleetId, 'settings'],
    queryFn: () => getAdminTenantSettings(fleetId),
    staleTime: 30_000,
    retry: false,
  })
}

/**
 * PUT /admin/fleets/{id}/settings mutation. On success invalidates EXACTLY the tenant's
 * settings read and the fleets list (so `/admin` reflects a renamed/deactivated fleet) —
 * never a bare invalidateQueries (rules/web-performance.md#query-keys).
 */
export function useUpdateAdminTenantSettings(fleetId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, UpdateAdminTenantSettingsRequest>({
    mutationFn: (req: UpdateAdminTenantSettingsRequest) => putAdminTenantSettings(fleetId, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'fleets', fleetId, 'settings'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'fleets'] })
    },
  })
}

export type { AdminTenantSettingsDto, UpdateAdminTenantSettingsRequest }

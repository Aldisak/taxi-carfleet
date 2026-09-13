import { useMutation, useQueryClient } from '@tanstack/react-query'
import { putFleetSettings, postFleetLogo } from '../../shared/api/client'
import type { UpdateFleetSettingsRequest } from '../../shared/api/client'

/**
 * PUT /fleet/settings mutation. On success, invalidates both the fleet-settings read
 * (Fleet tab) and the public/fleet branding query (so the customer PWA picks up a new
 * name/color/welcome without a rebuild — AC#4).
 */
export function useUpdateFleetSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: UpdateFleetSettingsRequest) => putFleetSettings(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet-settings'] })
      void queryClient.invalidateQueries({ queryKey: ['public', 'fleet'] })
    },
  })
}

/**
 * POST /fleet/logo mutation (multipart PNG). On success, invalidates public/fleet so the
 * new logoUrl (with a fresh ?v=ticks cache-bust) is picked up.
 */
export function useUploadFleetLogo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => postFleetLogo(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['public', 'fleet'] })
    },
  })
}

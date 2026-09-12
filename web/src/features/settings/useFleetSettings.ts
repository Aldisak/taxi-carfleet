import { useQuery } from '@tanstack/react-query'
import { getFleetSettings } from '../../shared/api/client'
import { mapFleetSettings } from './fleetSettingsMapper'

export function useFleetSettings() {
  return useQuery({
    queryKey: ['fleet-settings'],
    queryFn: async () => {
      const dto = await getFleetSettings()
      return mapFleetSettings(dto)
    },
    staleTime: 60_000,
  })
}

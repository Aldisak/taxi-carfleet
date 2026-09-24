import { useQuery } from '@tanstack/react-query'
import { getPublicFleet } from '../shared/api/client'

/** Minimal fleet branding for the desk header: name + primary color. */
export interface FleetHeaderData {
  /** Fleet display name, or undefined while loading / on error. */
  name: string | undefined
  /** Fleet primary color as #RRGGBB, or null when unset. */
  colorHex: string | null
}

/**
 * Loads the fleet name + primary color for the branded desk header via GET public/fleet.
 * Shares the canonical `['public','fleet']` query key + 5-min staleTime with the customer
 * branding hook, but stays a thin app-shell hook (no theme mapping, no customer feature import).
 */
export function useFleetHeader(): FleetHeaderData {
  const { data } = useQuery({
    queryKey: ['public', 'fleet'],
    queryFn: getPublicFleet,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  })

  return {
    name: data?.name,
    colorHex: data?.primaryColorHex ?? null,
  }
}

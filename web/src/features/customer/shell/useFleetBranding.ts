import type { DefaultTheme } from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { getPublicFleet, type PublicFleetResponse } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { theme as baseTheme } from '../../../shared/theme/theme'
import { applyFleetBranding } from './fleetBranding'

/** Result of useFleetBranding: the branded theme plus the raw fleet (phone, name). */
export interface UseFleetBrandingResult {
  /** The base theme with the fleet's primary color applied (or base while loading). */
  theme: DefaultTheme
  /** The raw public fleet response, or undefined while loading / on error. */
  fleet: PublicFleetResponse | undefined
  isLoading: boolean
}

/**
 * Loads fleet branding from GET public/fleet and maps it onto the styled-components
 * theme. The slug must already be persisted to authStorage (F-05) before this mounts.
 * Branding is cached aggressively — it rarely changes within a session.
 */
export function useFleetBranding(): UseFleetBrandingResult {
  const { data, isLoading } = useQuery({
    queryKey: ['public', 'fleet'],
    queryFn: async () => {
      const fleet = await getPublicFleet()
      // F1: persist the phone so the Zavolat button always has a number to dial on a
      // later cold/offline mount, even after the query cache is gone. TanStack Query v5
      // has no useQuery onSuccess, so persist in the queryFn wrapper.
      if (fleet.phone) {
        authStorage.setFleetPhone(fleet.phone)
      }
      return fleet
    },
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  })

  return {
    theme: applyFleetBranding(baseTheme, data),
    fleet: data,
    isLoading,
  }
}

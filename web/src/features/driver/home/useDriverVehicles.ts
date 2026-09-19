import { useQuery } from '@tanstack/react-query'
import { getDriverVehicles } from '../../../shared/api/client'

/**
 * Fetches the active vehicles in the driver's fleet for the go-online vehicle picker.
 * @param enabled Only fetch while the picker is shown (driver is Offline) to avoid
 *                needless calls during an active shift/ride.
 */
export function useDriverVehicles(enabled: boolean) {
  return useQuery({
    queryKey: ['driver', 'vehicles'],
    queryFn: () => getDriverVehicles(),
    enabled,
    staleTime: 60_000,
  })
}

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postGoOnline, ApiResponseError } from '../../../shared/api/client'

export interface UseGoOnlineResult {
  isPending: boolean
  error: string | null
  goOnline: (vehicleId: string) => Promise<void>
}

/**
 * Hook to go online with a vehicle.
 * On success, invalidates the driver/me query.
 * Maps expected errors to i18n keys.
 */
export function useGoOnline(): UseGoOnlineResult {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goOnline(vehicleId: string): Promise<void> {
    setError(null)
    setIsPending(true)
    try {
      await postGoOnline(vehicleId)
      await queryClient.invalidateQueries({ queryKey: ['driver', 'me'] })
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.status === 409) {
          setError('driver.home.errors.goOnlineConflict')
          // Reconcile — refetch so UI reflects actual server state
          await queryClient.invalidateQueries({ queryKey: ['driver', 'me'] })
        } else if (err.status === 404) {
          setError('driver.home.errors.goOnlineNotFound')
        } else {
          setError('driver.home.errors.goOnlineFailed')
        }
      } else {
        setError('driver.home.errors.goOnlineFailed')
      }
    } finally {
      setIsPending(false)
    }
  }

  return { isPending, error, goOnline }
}

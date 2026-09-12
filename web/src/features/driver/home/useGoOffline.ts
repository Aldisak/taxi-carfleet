import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { postGoOffline } from '../../../shared/api/client'

export interface UseGoOfflineResult {
  isPending: boolean
  error: string | null
  goOffline: () => Promise<void>
}

/**
 * Hook to go offline (end shift).
 * On success, invalidates the driver/me query.
 */
export function useGoOffline(): UseGoOfflineResult {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goOffline(): Promise<void> {
    setError(null)
    setIsPending(true)
    try {
      await postGoOffline()
      await queryClient.invalidateQueries({ queryKey: ['driver', 'me'] })
    } catch {
      setError('driver.home.errors.goOnlineFailed')
    } finally {
      setIsPending(false)
    }
  }

  return { isPending, error, goOffline }
}

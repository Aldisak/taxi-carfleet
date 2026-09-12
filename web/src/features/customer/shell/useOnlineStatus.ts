import { useEffect, useState } from 'react'

/**
 * Tracks browser online/offline status via navigator.onLine + the online/offline
 * window events. Reads keep working from the TanStack cache while offline; only
 * mutating actions (ordering) are gated (rules/web-realtime.md#offline-ux).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}

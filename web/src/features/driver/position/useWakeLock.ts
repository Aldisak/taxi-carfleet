import { useEffect, useRef } from 'react'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener?: (type: string, listener: () => void) => void
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

function getWakeLock(): WakeLockLike | undefined {
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
}

/**
 * Acquires a screen Wake Lock while enabled, feature-detected (no-op where
 * navigator.wakeLock is undefined, e.g. iOS < 16.4 and all test environments).
 *
 * The OS auto-releases the lock when the tab backgrounds; we re-acquire on
 * visibilitychange -> visible so the screen stays awake across app switches.
 *
 * @param enabled  True on ride screens where the screen must stay awake.
 */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) return
    const wakeLock = getWakeLock()
    if (!wakeLock) return // feature not supported — no-op

    let cancelled = false

    async function acquire(): Promise<void> {
      try {
        const sentinel = await wakeLock!.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        sentinelRef.current = sentinel
      } catch {
        // User denied or the lock failed — nothing to do; ride screen still works.
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'visible' && sentinelRef.current === null) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      if (sentinel) void sentinel.release()
    }
  }, [enabled])
}

import { useState, useCallback } from 'react'
import { getMuted, setMuted } from '../realtime/useFleetHub'

/**
 * Hook for the header mute toggle.
 * Persists mute state to localStorage under 'fleet_sound_muted'.
 *
 * @returns [isMuted, toggleMute]
 */
export function useNotificationSound(): [boolean, () => void] {
  const [muted, setMutedState] = useState(() => getMuted())

  const toggle = useCallback(() => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }, [muted])

  return [muted, toggle]
}

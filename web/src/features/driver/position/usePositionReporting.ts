import { useEffect, useRef, useState } from 'react'
import { invokeHub } from '../../../shared/realtime/useFleetHub'
import { shouldSendPosition, type SentPosition } from './positionThrottle'
import { useOwnPositionStore } from './useOwnPositionStore'

/** A position is considered stale if nothing was successfully sent for this long (ms). */
export const STALE_THRESHOLD_MS = 60_000

/** Result of the position-reporting hook. */
export interface UsePositionReportingResult {
  /** True when nothing has been successfully sent to the hub for >= 60s while online. */
  stale: boolean
}

/**
 * Background position reporting for the driver while online.
 *
 * watchPosition(enableHighAccuracy) drives hub UpdatePosition(lat,lng,heading,speed) on the
 * existing /hubs/fleet singleton, throttled to at most every 3s OR when moved > 25m
 * (positionThrottle.ts). The "last sent" clock advances ONLY on a successful hub invoke, so a
 * failed send is retried and the 60s stale banner fires when sends are genuinely failing.
 *
 * @param enabled  True while the driver is online (watch stops when offline to save battery).
 */
export function usePositionReporting(enabled: boolean): UsePositionReportingResult {
  const [stale, setStale] = useState(false)
  const lastSentRef = useRef<SentPosition | null>(null)
  const lastSuccessAtRef = useRef<number | null>(null)
  const vibratedRef = useRef(false)
  const setOwnPosition = useOwnPositionStore(s => s.setPosition)
  const setLastSentAt = useOwnPositionStore(s => s.setLastSentAt)

  useEffect(() => {
    if (!enabled) return
    const geo = navigator.geolocation
    if (!geo || typeof geo.watchPosition !== 'function') return

    lastSentRef.current = null
    lastSuccessAtRef.current = Date.now()
    vibratedRef.current = false
    setStale(false)

    const watchId = geo.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, heading, speed } = pos.coords
        setOwnPosition({ lat, lng, heading: heading ?? null, speed: speed ?? null })

        const now = Date.now()
        if (!shouldSendPosition({ lat, lng }, lastSentRef.current, now)) return

        void invokeHub('UpdatePosition', lat, lng, heading ?? null, speed ?? null)
          .then((sent) => {
            if (!sent) return // not connected — do NOT advance the clock
            lastSentRef.current = { lat, lng, at: now }
            lastSuccessAtRef.current = now
            setLastSentAt(new Date(now).toISOString())
            setStale(false)
            vibratedRef.current = false
          })
          .catch(() => {
            // Invoke threw (transient) — treat as not sent; clock stays put for retry.
          })
      },
      undefined,
      { enableHighAccuracy: true },
    )

    // Stale watchdog: once nothing has been sent for 60s, show the banner and vibrate once.
    const watchdog = setInterval(() => {
      const last = lastSuccessAtRef.current
      if (last === null) return
      if (Date.now() - last >= STALE_THRESHOLD_MS) {
        setStale(true)
        if (!vibratedRef.current && typeof navigator.vibrate === 'function') {
          navigator.vibrate(400)
          vibratedRef.current = true
        }
      }
    }, 1000)

    return () => {
      clearInterval(watchdog)
      if (typeof geo.clearWatch === 'function') geo.clearWatch(watchId)
    }
  }, [enabled, setOwnPosition, setLastSentAt])

  return { stale }
}

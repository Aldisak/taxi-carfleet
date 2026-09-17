import { useEffect, useRef, useState, useCallback } from 'react'
import type { LatLng } from './centerPin'

/**
 * Resolved customer-location status.
 * - `locating`    — a one-shot fix is in flight (initial mount or after request()).
 * - `granted`     — a fix arrived; `coords` carries the device position.
 * - `denied`      — the user refused geolocation (or the Permissions API reports it denied).
 * - `unavailable` — geolocation is not supported / errored non-permission.
 *
 * Deliberately NOT centerPin.ts's GeoPermissionState (which has `prompt`, no `locating`): this is
 * the customer-shell *request* lifecycle, not the pure center-source decision — don't cross-import.
 */
export type CustomerLocationStatus = 'locating' | 'granted' | 'denied' | 'unavailable'

/** What the customer-location hook returns. */
export interface CustomerLocationResult {
  /** The device GPS position once a fix succeeds, else null. */
  coords: LatLng | null
  /** The current request lifecycle status. */
  status: CustomerLocationStatus
  /** Re-request a one-shot fix (the "Use my location" button). Cancellation-safe. */
  request: () => void
}

/**
 * One-shot browser-geolocation hook for the customer map shell (UC-018 route-preview-gps).
 *
 * Wraps `navigator.geolocation.getCurrentPosition` (one-shot, feature-detected — mirrors
 * useOfferRoute) plus `navigator.permissions.query({ name: 'geolocation' })` for later
 * revocation (mirrors DriverMapScreen). It requests a fix once on mount and again whenever
 * `request()` is called (the "Use my location" tap). Graceful degrade:
 * - geolocation absent → status `unavailable`, coords null, no getCurrentPosition call.
 * - a position error (permission refused / timeout) → status `denied`, coords null.
 *
 * Every async settle is guarded by a per-attempt cancelled flag so an unmount (or a superseding
 * request) never sets state on a dead component.
 */
export function useCustomerLocation(): CustomerLocationResult {
  const [coords, setCoords] = useState<LatLng | null>(null)
  const [status, setStatus] = useState<CustomerLocationStatus>('locating')

  // Latest-attempt token so a superseding request()/unmount cancels an in-flight fix.
  const attemptRef = useRef(0)

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      setCoords(null)
      return
    }

    const attempt = ++attemptRef.current
    setStatus('locating')

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (attempt !== attemptRef.current) return
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('granted')
      },
      () => {
        if (attempt !== attemptRef.current) return
        setCoords(null)
        setStatus('denied')
      },
      { timeout: 5000, maximumAge: 30_000 },
    )
  }, [])

  useEffect(() => {
    request()

    // Watch for a later permission revocation (mirrors DriverMapScreen's Permissions API use).
    let cancelled = false
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (cancelled) return
          result.onchange = () => {
            if (cancelled) return
            if (result.state === 'denied') {
              attemptRef.current++ // cancel any in-flight fix
              setCoords(null)
              setStatus('denied')
            }
          }
        })
        .catch(() => {
          /* ignore — the getCurrentPosition path already governs status */
        })
    }

    return () => {
      cancelled = true
      // attemptRef is a plain invalidation counter (never a DOM node) — bumping it on unmount
      // cancels any in-flight getCurrentPosition callback. The exhaustive-deps ref-in-cleanup
      // warning is a false positive for counter refs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      attemptRef.current++
    }
    // Mount-only: request is stable (useCallback with no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { coords, status, request }
}

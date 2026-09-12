import type { DriverPosition } from '../../shared/realtime/usePositionStore'

/** Callback invoked at most once per window with the latest position per driver. */
export type ThrottleFlushCallback = (positions: Record<string, DriverPosition>) => void

/**
 * A trailing-emit throttle for driver position updates.
 * Accumulates updates and flushes once per `intervalMs` window, emitting the
 * latest position for each driver seen during the window.
 *
 * Only a single timer is used; it is cancelled on flush and restarted on the
 * next push after the window expires.
 */
export interface MarkerThrottle {
  /** Queue a position update. Will be coalesced with other updates in the current window. */
  push: (position: DriverPosition) => void
  /** Flush immediately and cancel any pending timer. */
  flush: () => void
}

/**
 * Creates a new marker throttle.
 *
 * @param onFlush - Called with the latest positions each time the window expires.
 * @param intervalMs - Window size in milliseconds (default 1000).
 */
export function createMarkerThrottle(
  onFlush: ThrottleFlushCallback,
  intervalMs = 1000,
): MarkerThrottle {
  const pending = new Map<string, DriverPosition>()
  let timerId: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    if (pending.size === 0) return
    const snapshot: Record<string, DriverPosition> = {}
    for (const [id, pos] of pending.entries()) {
      snapshot[id] = pos
    }
    pending.clear()
    onFlush(snapshot)
  }

  function push(position: DriverPosition) {
    pending.set(position.driverId, position)
    if (timerId === null) {
      timerId = setTimeout(flush, intervalMs)
    }
  }

  return { push, flush }
}

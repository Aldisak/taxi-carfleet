/** Reconnect delay schedule in milliseconds: [0, 2000, 5000, 10000, 30000, 30000, ...]. */
const BACKOFF_SCHEDULE = [0, 2000, 5000, 10000, 30000] as const

/**
 * Returns the reconnect delay in milliseconds for a given retry count.
 * Never returns null — the connection retries indefinitely (dispatch boards run all day).
 * Caps at 30 000 ms after the 5th attempt.
 */
export function getReconnectDelay(retryCount: number): number {
  const idx = Math.min(retryCount, BACKOFF_SCHEDULE.length - 1)
  return BACKOFF_SCHEDULE[idx]
}

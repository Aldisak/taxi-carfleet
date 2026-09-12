/** 5 minutes in milliseconds — the server-enforced minimum wait before no-show cancel. */
export const NO_SHOW_DELAY_MS = 5 * 60 * 1000

/** Result of the no-show timer computation. */
export interface NoShowResult {
  /** True when the 5-minute wait has elapsed and no-show cancel is allowed. */
  enabled: boolean
  /** Remaining seconds until enabled. 0 when already enabled. */
  remainingSeconds: number
}

/**
 * Pure function: computes the no-show button state from arrivedAt timestamp.
 * No side effects. No timers.
 *
 * @param arrivedAt  ISO string or Date when the driver arrived (Arrived state entry)
 * @param now        Current time as ISO string or Date
 */
export function computeNoShow(
  arrivedAt: Date | string,
  now: Date | string,
): NoShowResult {
  const arrivedMs = typeof arrivedAt === 'string' ? new Date(arrivedAt).getTime() : arrivedAt.getTime()
  const nowMs = typeof now === 'string' ? new Date(now).getTime() : now.getTime()
  const elapsedMs = nowMs - arrivedMs
  const remainingMs = Math.max(0, NO_SHOW_DELAY_MS - elapsedMs)
  return {
    enabled: remainingMs <= 0,
    remainingSeconds: Math.ceil(remainingMs / 1000),
  }
}

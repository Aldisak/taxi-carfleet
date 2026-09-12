/** Result of the countdown computation. */
export interface CountdownResult {
  /** Remaining seconds until expiry, clamped to 0. */
  remainingSeconds: number
  /** True when remainingSeconds has reached 0 — offer should auto-dismiss. */
  isDismissed: boolean
  /** SVG stroke-dashoffset for the countdown ring. Requires circumference = 2π × radius. */
  strokeDashoffset: number
}

const DEFAULT_RADIUS = 45

/**
 * Pure countdown math — no timers, no side effects.
 * @param expiresAt  Server-side expiry timestamp (Date or ISO string).
 * @param now        Current time to diff against (Date or ISO string).
 * @param totalSeconds  Total duration of the offer in seconds (used to compute ring fraction).
 * @param radius     SVG circle radius for stroke-dashoffset calculation (default 45).
 */
export function computeCountdown(
  expiresAt: Date | string,
  now: Date | string,
  totalSeconds: number,
  radius: number = DEFAULT_RADIUS,
): CountdownResult {
  const expiresMs = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt.getTime()
  const nowMs = typeof now === 'string' ? new Date(now).getTime() : now.getTime()

  const remainingMs = Math.max(0, expiresMs - nowMs)
  const remainingSeconds = remainingMs / 1000

  const circumference = 2 * Math.PI * radius
  // fraction consumed = how much of the total has elapsed
  const elapsed = totalSeconds - remainingSeconds
  const fractionConsumed = Math.min(1, Math.max(0, elapsed / totalSeconds))
  const strokeDashoffset = circumference * fractionConsumed

  return {
    remainingSeconds,
    isDismissed: remainingSeconds === 0,
    strokeDashoffset,
  }
}

/** SMS resend cooldown in seconds (spec §Login step: resend after 60 s). */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Seconds remaining until the code may be resent. Rounds up so the button stays
 * disabled for the full cooldown, clamps to 0, and is 0 when no code has been sent.
 *
 * @param lastSentAtMs Epoch ms of the last successful send, or null if none yet.
 * @param nowMs        Current epoch ms.
 */
export function secondsUntilResend(lastSentAtMs: number | null, nowMs: number): number {
  if (lastSentAtMs === null) return 0
  const elapsedMs = nowMs - lastSentAtMs
  const remainingMs = RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / 1000)
}

/** Whether the code may be resent now (cooldown elapsed, or never sent). */
export function canResend(lastSentAtMs: number | null, nowMs: number): boolean {
  return secondsUntilResend(lastSentAtMs, nowMs) === 0
}

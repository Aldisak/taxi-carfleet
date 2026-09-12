import { describe, it, expect } from 'vitest'
import { RESEND_COOLDOWN_SECONDS, secondsUntilResend, canResend } from './resendTimer'

describe('resendTimer', () => {
  it('uses a 60-second cooldown', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60)
  })

  it('reports the full cooldown immediately after a send', () => {
    const sentAt = 1_000_000
    expect(secondsUntilResend(sentAt, sentAt)).toBe(60)
  })

  it('counts down as time passes', () => {
    const sentAt = 1_000_000
    expect(secondsUntilResend(sentAt, sentAt + 10_000)).toBe(50)
  })

  it('rounds up partial seconds so the button stays disabled until truly elapsed', () => {
    const sentAt = 1_000_000
    expect(secondsUntilResend(sentAt, sentAt + 59_100)).toBe(1)
  })

  it('clamps to 0 once the cooldown has passed', () => {
    const sentAt = 1_000_000
    expect(secondsUntilResend(sentAt, sentAt + 60_000)).toBe(0)
    expect(secondsUntilResend(sentAt, sentAt + 120_000)).toBe(0)
  })

  it('canResend is false until the cooldown elapses, true after', () => {
    const sentAt = 1_000_000
    expect(canResend(sentAt, sentAt + 59_000)).toBe(false)
    expect(canResend(sentAt, sentAt + 60_000)).toBe(true)
  })

  it('canResend is true when there has been no send yet (null)', () => {
    expect(canResend(null, 1_000_000)).toBe(true)
  })

  it('secondsUntilResend is 0 when there has been no send yet (null)', () => {
    expect(secondsUntilResend(null, 1_000_000)).toBe(0)
  })
})

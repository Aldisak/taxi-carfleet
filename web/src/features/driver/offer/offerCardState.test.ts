import { describe, it, expect } from 'vitest'
import { offerActionOutcome } from './offerCardState'

describe('offerActionOutcome', () => {
  it('success -> dismiss immediately (dismissAfterMs 0), no banners', () => {
    const out = offerActionOutcome('success', 'offer')
    expect(out.dismissAfterMs).toBe(0)
    expect(out.showOffline).toBe(false)
    expect(out.showStale).toBe(false)
    expect(out.showReasonError).toBe(false)
  })

  it('stale -> stale banner + dismiss after 2000ms', () => {
    const out = offerActionOutcome('stale', 'offer')
    expect(out.showStale).toBe(true)
    expect(out.dismissAfterMs).toBe(2000)
    expect(out.nextPhase).toBe('expired')
  })

  it('offline -> offline hint, stay on the current phase (no dismiss)', () => {
    const out = offerActionOutcome('offline', 'offer')
    expect(out.showOffline).toBe(true)
    expect(out.nextPhase).toBe('offer')
    expect(out.dismissAfterMs).toBeNull()
  })

  it('noReason -> reason error, stay on the declining phase (no dismiss)', () => {
    const out = offerActionOutcome('noReason', 'declining')
    expect(out.showReasonError).toBe(true)
    expect(out.nextPhase).toBe('declining')
    expect(out.dismissAfterMs).toBeNull()
  })
})

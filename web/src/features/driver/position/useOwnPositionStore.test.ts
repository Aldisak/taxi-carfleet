import { describe, it, expect, beforeEach } from 'vitest'
import { useOwnPositionStore } from './useOwnPositionStore'

describe('useOwnPositionStore', () => {
  beforeEach(() => {
    useOwnPositionStore.setState({ position: null, lastSentAt: null })
  })

  it('starts with no position', () => {
    expect(useOwnPositionStore.getState().position).toBeNull()
    expect(useOwnPositionStore.getState().lastSentAt).toBeNull()
  })

  it('records the last observed own position', () => {
    useOwnPositionStore.getState().setPosition({ lat: 50.08, lng: 14.43, heading: 90, speed: 12 })
    expect(useOwnPositionStore.getState().position).toEqual({ lat: 50.08, lng: 14.43, heading: 90, speed: 12 })
  })

  it('records the last-sent timestamp separately (diagnostics)', () => {
    useOwnPositionStore.getState().setLastSentAt('2026-09-12T10:00:00.000Z')
    expect(useOwnPositionStore.getState().lastSentAt).toBe('2026-09-12T10:00:00.000Z')
  })
})

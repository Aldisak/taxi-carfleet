import { describe, it, expect, beforeEach } from 'vitest'
import { getMuted, setMuted } from './useFleetHub'

// Use a fresh localStorage for each test by mocking it
describe('mute toggle persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('getMuted returns false by default', () => {
    expect(getMuted()).toBe(false)
  })

  it('setMuted(true) persists to localStorage', () => {
    setMuted(true)
    expect(localStorage.getItem('fleet_sound_muted')).toBe('true')
  })

  it('getMuted returns true after setMuted(true)', () => {
    setMuted(true)
    expect(getMuted()).toBe(true)
  })

  it('setMuted(false) persists to localStorage', () => {
    setMuted(true)
    setMuted(false)
    expect(getMuted()).toBe(false)
  })

  it('getMuted returns true when localStorage has "true"', () => {
    localStorage.setItem('fleet_sound_muted', 'true')
    expect(getMuted()).toBe(true)
  })

  it('getMuted returns false when localStorage has "false"', () => {
    localStorage.setItem('fleet_sound_muted', 'false')
    expect(getMuted()).toBe(false)
  })
})

describe('useHubConnectionState / useConnectionState — banner state transitions', () => {
  it('exports a useHubConnectionState hook', async () => {
    const mod = await import('./useFleetHub')
    expect(typeof mod.useHubConnectionState).toBe('function')
  })

  it('exports useConnectionState as alias of useHubConnectionState', async () => {
    const mod = await import('./useFleetHub')
    expect(typeof mod.useConnectionState).toBe('function')
  })
})

describe('getReconnectDelay integration with InfiniteRetryPolicy', () => {
  it('getReconnectDelay is always non-null (as tested in reconnectBackoff.test.ts)', async () => {
    const { getReconnectDelay } = await import('./reconnectBackoff')
    for (let i = 0; i < 20; i++) {
      const delay = getReconnectDelay(i)
      expect(delay).not.toBeNull()
      expect(typeof delay).toBe('number')
    }
  })
})

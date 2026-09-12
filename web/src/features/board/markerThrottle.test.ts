import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createMarkerThrottle } from './markerThrottle'

describe('markerThrottle — 1s coalescing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits immediately on first update', () => {
    const emitted: string[] = []
    const throttle = createMarkerThrottle((positions) => {
      emitted.push(...Object.keys(positions))
    }, 1000)

    throttle.push({ driverId: 'a', lat: 1, lng: 1, heading: null, speed: null, at: '' })

    // advance a tick so the trailing emit fires
    vi.advanceTimersByTime(1000)

    expect(emitted).toContain('a')
  })

  it('coalesces multiple updates within 1s to a single emit', () => {
    const calls: number[] = []
    const throttle = createMarkerThrottle((positions) => {
      calls.push(Object.keys(positions).length)
    }, 1000)

    throttle.push({ driverId: 'a', lat: 1, lng: 1, heading: 0, speed: null, at: '' })
    throttle.push({ driverId: 'b', lat: 2, lng: 2, heading: 45, speed: null, at: '' })
    throttle.push({ driverId: 'a', lat: 3, lng: 3, heading: 90, speed: null, at: '' })

    vi.advanceTimersByTime(1000)

    // Only one emit with both drivers
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(2) // a and b
  })

  it('emits latest position when same driver updated multiple times', () => {
    let lastPositions: Record<string, { lat: number }> = {}
    const throttle = createMarkerThrottle((positions) => {
      lastPositions = positions as Record<string, { lat: number }>
    }, 1000)

    throttle.push({ driverId: 'a', lat: 10, lng: 1, heading: null, speed: null, at: '' })
    throttle.push({ driverId: 'a', lat: 20, lng: 1, heading: null, speed: null, at: '' })
    throttle.push({ driverId: 'a', lat: 30, lng: 1, heading: null, speed: null, at: '' })

    vi.advanceTimersByTime(1000)

    expect(lastPositions['a']?.lat).toBe(30)
  })

  it('after 1s window, a new update starts a fresh window', () => {
    const calls: number[] = []
    const throttle = createMarkerThrottle(() => {
      calls.push(1)
    }, 1000)

    throttle.push({ driverId: 'a', lat: 1, lng: 1, heading: null, speed: null, at: '' })
    vi.advanceTimersByTime(1000)  // first window
    throttle.push({ driverId: 'b', lat: 2, lng: 2, heading: null, speed: null, at: '' })
    vi.advanceTimersByTime(1000)  // second window

    expect(calls).toHaveLength(2)
  })
})

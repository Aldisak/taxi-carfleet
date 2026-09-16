import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveCenterSource, createMoveendDebouncer, type LatLng } from './centerPin'

const gps: LatLng = { lat: 50.0755, lng: 14.4378 }
const config: LatLng = { lat: 49.9481, lng: 15.2681 }

describe('resolveCenterSource', () => {
  it('uses the GPS center when permission is granted and coords are present', () => {
    expect(resolveCenterSource('granted', gps, config)).toEqual(gps)
  })

  it('falls back to the config center when permission is denied', () => {
    expect(resolveCenterSource('denied', gps, config)).toEqual(config)
  })

  it('falls back to the config center when permission is unavailable', () => {
    expect(resolveCenterSource('unavailable', gps, config)).toEqual(config)
  })

  it('uses the config center while the permission is still prompting/loading', () => {
    expect(resolveCenterSource('prompt', gps, config)).toEqual(config)
    expect(resolveCenterSource('prompt', null, config)).toEqual(config)
  })

  it('falls back to the config center when granted but no GPS coords have arrived yet', () => {
    expect(resolveCenterSource('granted', null, config)).toEqual(config)
  })
})

describe('createMoveendDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits only the settled coords after the debounce window', () => {
    const emit = vi.fn()
    const debouncer = createMoveendDebouncer(300, emit)

    debouncer.push({ lat: 1, lng: 1 })
    debouncer.push({ lat: 2, lng: 2 })
    debouncer.push({ lat: 3, lng: 3 })

    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(299)
    expect(emit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({ lat: 3, lng: 3 })
  })

  it('emits again for a later settled move', () => {
    const emit = vi.fn()
    const debouncer = createMoveendDebouncer(300, emit)

    debouncer.push({ lat: 1, lng: 1 })
    vi.advanceTimersByTime(300)
    expect(emit).toHaveBeenCalledTimes(1)

    debouncer.push({ lat: 5, lng: 5 })
    vi.advanceTimersByTime(300)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith({ lat: 5, lng: 5 })
  })

  it('cancel() stops a pending emit', () => {
    const emit = vi.fn()
    const debouncer = createMoveendDebouncer(300, emit)

    debouncer.push({ lat: 1, lng: 1 })
    debouncer.cancel()
    vi.advanceTimersByTime(300)
    expect(emit).not.toHaveBeenCalled()
  })
})

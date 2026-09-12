import { describe, it, expect } from 'vitest'
import { selectCarMarker } from './trackingMarker'

describe('selectCarMarker', () => {
  it('prefers the live position store entry when present (authed mode)', () => {
    const marker = selectCarMarker({
      livePosition: { lat: 50.1, lng: 14.5 },
      fallbackPosition: { lat: 50.0, lng: 14.4 },
    })
    expect(marker).toEqual({ lat: 50.1, lng: 14.5 })
  })

  it('falls back to the DTO position when there is no live entry (public poll)', () => {
    const marker = selectCarMarker({
      livePosition: null,
      fallbackPosition: { lat: 50.0, lng: 14.4 },
    })
    expect(marker).toEqual({ lat: 50.0, lng: 14.4 })
  })

  it('returns null when neither a live nor a fallback position exists', () => {
    expect(selectCarMarker({ livePosition: null, fallbackPosition: null })).toBeNull()
  })
})

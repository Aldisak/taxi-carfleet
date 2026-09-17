import { describe, it, expect } from 'vitest'
import type { LatLng } from '../shell/mapCamera'
import { pickSuggestLocation } from './suggestLocation'

const mapCenter: LatLng = { lat: 50.087654, lng: 14.431234 }
const gps: LatLng = { lat: 49.951, lng: 15.268 }
const configCenter: LatLng = { lat: 49.42, lng: 18.78 }

describe('pickSuggestLocation', () => {
  it('prefers the map center over GPS and config center', () => {
    const result = pickSuggestLocation({ mapCenter, gpsLocation: gps, configCenter })
    // Map center wins, rounded to 2 decimals.
    expect(result).toEqual({ lat: 50.09, lng: 14.43 })
  })

  it('falls back to GPS when there is no map center', () => {
    const result = pickSuggestLocation({ mapCenter: null, gpsLocation: gps, configCenter })
    expect(result).toEqual({ lat: 49.95, lng: 15.27 })
  })

  it('falls back to the config center when there is neither map center nor GPS', () => {
    const result = pickSuggestLocation({ mapCenter: null, gpsLocation: null, configCenter })
    expect(result).toEqual({ lat: 49.42, lng: 18.78 })
  })

  it('returns null when no location is available', () => {
    const result = pickSuggestLocation({ mapCenter: null, gpsLocation: null, configCenter: null })
    expect(result).toBeNull()
  })

  it('rounds the chosen coordinate to 2 decimals (~1.1 km granularity)', () => {
    const result = pickSuggestLocation({
      mapCenter: { lat: 50.087654, lng: 14.431234 },
      gpsLocation: null,
      configCenter: null,
    })
    expect(result).toEqual({ lat: 50.09, lng: 14.43 })
  })

  it('a tiny map nudge (< ~1 km) rounds to the SAME value so the query key is stable', () => {
    const a = pickSuggestLocation({ mapCenter: { lat: 50.0812, lng: 14.4278 }, gpsLocation: null, configCenter: null })
    const b = pickSuggestLocation({ mapCenter: { lat: 50.0834, lng: 14.4321 }, gpsLocation: null, configCenter: null })
    expect(a).toEqual(b)
    expect(a).toEqual({ lat: 50.08, lng: 14.43 })
  })

  it('a > ~1.1 km move rounds to a DIFFERENT value so a re-query fires', () => {
    const a = pickSuggestLocation({ mapCenter: { lat: 50.08, lng: 14.43 }, gpsLocation: null, configCenter: null })
    const b = pickSuggestLocation({ mapCenter: { lat: 50.10, lng: 14.45 }, gpsLocation: null, configCenter: null })
    expect(a).not.toEqual(b)
  })
})

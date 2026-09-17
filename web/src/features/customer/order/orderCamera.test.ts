import { describe, it, expect } from 'vitest'
import { orderCameraPoints } from './orderCamera'
import type { SelectedPlace } from './orderFlowState'

const PICKUP: SelectedPlace = { label: 'Centrum', lat: 49.948, lng: 15.268 }
const DEST: SelectedPlace = { label: 'Nádraží', lat: 49.95, lng: 15.271 }

describe('orderCamera', () => {
  it('returns no points when neither pickup nor destination is set', () => {
    expect(orderCameraPoints(null, null)).toEqual([])
  })

  it('returns a single point (setView) for a pickup with no destination', () => {
    expect(orderCameraPoints(PICKUP, null)).toEqual([{ lat: PICKUP.lat, lng: PICKUP.lng }])
  })

  it('returns a single point for a destination with no pickup', () => {
    expect(orderCameraPoints(null, DEST)).toEqual([{ lat: DEST.lat, lng: DEST.lng }])
  })

  it('returns both points (fitBounds) once pickup and destination are set', () => {
    expect(orderCameraPoints(PICKUP, DEST)).toEqual([
      { lat: PICKUP.lat, lng: PICKUP.lng },
      { lat: DEST.lat, lng: DEST.lng },
    ])
  })

  it('strips the label — returns only LatLng, never the SelectedPlace', () => {
    const points = orderCameraPoints(PICKUP, DEST)
    for (const p of points) {
      expect(Object.keys(p).sort()).toEqual(['lat', 'lng'])
    }
  })
})

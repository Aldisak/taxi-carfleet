import { describe, it, expect } from 'vitest'
import { cameraIntent, MIN_CAMERA_ZOOM } from './mapCamera'

describe('mapCamera', () => {
  it('setView_singlePoint_returnsSetViewIntentWithClampedZoom', () => {
    // A single target below the min zoom clamps up to the configured minimum
    // (mirrors MapCenterController's Math.max(getZoom(), 14) precedent).
    const intent = cameraIntent({ points: [{ lat: 50.08, lng: 14.42 }], currentZoom: 10 })
    expect(intent).toEqual({
      kind: 'setView',
      center: { lat: 50.08, lng: 14.42 },
      zoom: MIN_CAMERA_ZOOM,
    })
  })

  it('setView_singlePoint_keepsCurrentZoomWhenAlreadyAbentMinimum', () => {
    // A single target keeps the current zoom when it already exceeds the minimum.
    const intent = cameraIntent({ points: [{ lat: 50.08, lng: 14.42 }], currentZoom: 17 })
    expect(intent).toEqual({
      kind: 'setView',
      center: { lat: 50.08, lng: 14.42 },
      zoom: 17,
    })
  })

  it('fitBounds_multiplePoints_returnsBoundsIntent', () => {
    // >= 2 points returns a fitBounds intent over their bounding box.
    const intent = cameraIntent({
      points: [
        { lat: 50.0, lng: 14.4 },
        { lat: 50.2, lng: 14.6 },
        { lat: 49.9, lng: 14.5 },
      ],
      currentZoom: 12,
    })
    expect(intent).toEqual({
      kind: 'fitBounds',
      bounds: {
        southWest: { lat: 49.9, lng: 14.4 },
        northEast: { lat: 50.2, lng: 14.6 },
      },
    })
  })

  it('returns null when there are no points (no camera move)', () => {
    expect(cameraIntent({ points: [], currentZoom: 12 })).toBeNull()
  })
})

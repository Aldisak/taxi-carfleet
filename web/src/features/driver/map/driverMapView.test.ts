import { describe, it, expect } from 'vitest'
import { selectDriverMapCamera } from './driverMapView'
import { cameraIntent } from '../../../shared/map/mapCamera'

const own = { lat: 50.08, lng: 14.42 }
const legEnd = { lat: 50.1, lng: 14.5 }

describe('selectDriverMapCamera', () => {
  it('own + legEnd -> length-2 array (frame both) -> fitBounds', () => {
    const points = selectDriverMapCamera({ own, legStart: null, legEnd })
    expect(points).toHaveLength(2)
    expect(cameraIntent({ points, currentZoom: 12 })?.kind).toBe('fitBounds')
  })

  it('own only -> length-1 array -> setView', () => {
    const points = selectDriverMapCamera({ own, legStart: null, legEnd: null })
    expect(points).toHaveLength(1)
    expect(cameraIntent({ points, currentZoom: 12 })?.kind).toBe('setView')
  })

  it('nothing known -> empty array -> null intent (no move)', () => {
    const points = selectDriverMapCamera({ own: null, legStart: null, legEnd: null })
    expect(points).toHaveLength(0)
    expect(cameraIntent({ points, currentZoom: 12 })).toBeNull()
  })

  it('legStart is not framed (WI-5 passes legStart: own) -> still [own, legEnd] length-2', () => {
    // WI-5 calls with legStart: own; the frame must remain [own, legEnd], never a
    // 3-element [own, own, legEnd]. legStart is an input signature slot, not a frame point.
    const points = selectDriverMapCamera({ own, legStart: own, legEnd })
    expect(points).toHaveLength(2)
    expect(points).toEqual([own, legEnd])
  })
})

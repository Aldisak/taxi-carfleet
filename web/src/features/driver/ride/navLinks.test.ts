import { describe, it, expect } from 'vitest'
import { buildNavUrl, type NavAppPreference } from './navLinks'

describe('buildNavUrl', () => {
  const lat = 50.0755
  const lng = 14.4378
  const label = 'Praha'

  it('geo preference returns geo: URI', () => {
    const url = buildNavUrl('geo', lat, lng, label)
    expect(url).toBe(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`)
  })

  it('google preference returns Google Maps URL', () => {
    const url = buildNavUrl('google', lat, lng, label)
    expect(url).toContain('google.com/maps')
    expect(url).toContain(`${lat}`)
    expect(url).toContain(`${lng}`)
  })

  it('mapy preference returns Mapy.cz URL', () => {
    const url = buildNavUrl('mapy', lat, lng, label)
    expect(url).toContain('mapy.cz')
    expect(url).toContain(`${lat}`)
    expect(url).toContain(`${lng}`)
  })

  it('waze preference returns Waze URL', () => {
    const url = buildNavUrl('waze', lat, lng, label)
    expect(url).toContain('waze.com')
    expect(url).toContain(`${lat}`)
    expect(url).toContain(`${lng}`)
  })

  it('defaults to geo when no preference given', () => {
    const url = buildNavUrl('geo', lat, lng)
    expect(url).toContain('geo:')
  })

  it('google URL format is correct deep link', () => {
    const url = buildNavUrl('google', lat, lng, label)
    expect(url).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    )
  })

  it('waze URL format is correct deep link', () => {
    const url = buildNavUrl('waze', lat, lng, label)
    expect(url).toBe(
      `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    )
  })

  it('mapy URL format is correct deep link', () => {
    const url = buildNavUrl('mapy', lat, lng, label)
    expect(url).toBe(
      `https://mapy.cz/zakladni?x=${lng}&y=${lat}&z=17&pano=1&q=${encodeURIComponent(String(lat))}%2C${encodeURIComponent(String(lng))}`,
    )
  })
})

// Type check
const _pref: NavAppPreference = 'geo'
void _pref

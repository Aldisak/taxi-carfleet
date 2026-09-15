import { describe, it, expect } from 'vitest'
import { buildTileUrl, resolveTilePixelRatio } from './tileTemplate'

const TEMPLATE = 'https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}'
const KEY = 'browser-key-123'

describe('resolveTilePixelRatio', () => {
  it('uses 1x tiles at standard density (dpr <= 1.5)', () => {
    expect(resolveTilePixelRatio(1)).toBe(1)
    expect(resolveTilePixelRatio(1.5)).toBe(1)
  })

  it('uses 2x tiles only when dpr > 1.5', () => {
    expect(resolveTilePixelRatio(1.6)).toBe(2)
    expect(resolveTilePixelRatio(2)).toBe(2)
    expect(resolveTilePixelRatio(3)).toBe(2)
  })
})

describe('buildTileUrl', () => {
  it('injects the browser key into the {apikey} placeholder', () => {
    const url = buildTileUrl(TEMPLATE, KEY, 1)
    expect(url).toContain('apikey=browser-key-123')
    expect(url).not.toContain('{apikey}')
  })

  it('keeps the {z}/{x}/{y} placeholders for Leaflet to fill', () => {
    const url = buildTileUrl(TEMPLATE, KEY, 1)
    expect(url).toContain('{z}/{x}/{y}')
  })

  it('leaves the 256 tile-size segment unchanged at standard density', () => {
    const url = buildTileUrl(TEMPLATE, KEY, 1)
    expect(url).toContain('/basic/256/')
    expect(url).not.toContain('@2x')
  })

  it('switches the basic tile-size segment to 256@2x when dpr > 1.5', () => {
    const url = buildTileUrl(TEMPLATE, KEY, 2)
    expect(url).toContain('/basic/256@2x/')
  })

  it('does not append @2x twice when the ratio call is repeated', () => {
    const url = buildTileUrl(TEMPLATE, KEY, 2)
    expect(url.match(/@2x/g)).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { theme } from '../../../shared/theme/theme'
import { applyFleetBranding } from './fleetBranding'

describe('applyFleetBranding', () => {
  it('overrides the primary color from the fleet response', () => {
    const branded = applyFleetBranding(theme, { name: 'Acme', phone: '+420123456789', primaryColorHex: '#ff8800', currency: 'CZK', timeZone: 'Europe/Prague', welcomeText: null, logoUrl: null })
    expect(branded.colors.primary).toBe('#ff8800')
  })

  it('keeps all other theme tokens unchanged', () => {
    const branded = applyFleetBranding(theme, { name: 'Acme', phone: '+420123456789', primaryColorHex: '#ff8800', currency: 'CZK', timeZone: 'Europe/Prague', welcomeText: null, logoUrl: null })
    expect(branded.colors.background).toBe(theme.colors.background)
    expect(branded.spacing).toBe(theme.spacing)
  })

  it('falls back to the theme primary token when primaryColorHex is null', () => {
    const branded = applyFleetBranding(theme, { name: 'Acme', phone: '+420123456789', primaryColorHex: null, currency: 'CZK', timeZone: 'Europe/Prague', welcomeText: null, logoUrl: null })
    expect(branded.colors.primary).toBe(theme.colors.primary)
  })

  it('returns the base theme unchanged when there is no fleet (undefined)', () => {
    const branded = applyFleetBranding(theme, undefined)
    expect(branded).toBe(theme)
  })

  it('ignores a malformed (non #RRGGBB) color and keeps the theme token', () => {
    const branded = applyFleetBranding(theme, { name: 'Acme', phone: '+420123456789', primaryColorHex: 'red', currency: 'CZK', timeZone: 'Europe/Prague', welcomeText: null, logoUrl: null })
    expect(branded.colors.primary).toBe(theme.colors.primary)
  })
})

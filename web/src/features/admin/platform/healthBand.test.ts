import { describe, it, expect } from 'vitest'
import { healthBand } from './healthBand'

describe('healthBand', () => {
  it('maps growing to its label key with a white-on-success token pair', () => {
    const band = healthBand('growing')
    expect(band.labelKey).toBe('admin.platform.health.growing')
    expect(band.colorToken).toBe('success')
    expect(band.fgToken).toBe('textOnPrimary')
  })

  it('maps stable to its label key with a white-on-textSecondary token pair', () => {
    const band = healthBand('stable')
    expect(band.labelKey).toBe('admin.platform.health.stable')
    expect(band.colorToken).toBe('textSecondary')
    expect(band.fgToken).toBe('textOnPrimary')
  })

  it('maps declining to its label key with a white-on-error token pair', () => {
    const band = healthBand('declining')
    expect(band.labelKey).toBe('admin.platform.health.declining')
    expect(band.colorToken).toBe('error')
    expect(band.fgToken).toBe('textOnPrimary')
  })

  it('maps inactive to warning with DARK foreground (amber needs dark text for contrast)', () => {
    // #f9ab00 (warning) fails WCAG with white text (~1.9:1). The codebase status-pill
    // convention pairs this amber with dark #202124 (statusBusyText / orderAssignedText).
    const band = healthBand('inactive')
    expect(band.labelKey).toBe('admin.platform.health.inactive')
    expect(band.colorToken).toBe('warning')
    expect(band.fgToken).toBe('text')
  })

  it('falls back to the stable band for an unknown value (never recomputes)', () => {
    const band = healthBand('something-else')
    expect(band.labelKey).toBe('admin.platform.health.stable')
    expect(band.colorToken).toBe('textSecondary')
    expect(band.fgToken).toBe('textOnPrimary')
  })
})

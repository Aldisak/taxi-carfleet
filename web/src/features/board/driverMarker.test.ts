import { describe, it, expect } from 'vitest'
import { getDriverMarkerProps, getMarkerColorToken } from './driverMarker'

describe('driverMarker — icon selection by status and heading', () => {
  it('Free driver gets green color', () => {
    const props = getDriverMarkerProps('Free', 0)
    expect(props.color).toBe('green')
  })

  it('Busy driver gets orange color', () => {
    const props = getDriverMarkerProps('Busy', null)
    expect(props.color).toBe('orange')
  })

  it('EnRoute driver gets blue color', () => {
    const props = getDriverMarkerProps('EnRoute', 90)
    expect(props.color).toBe('blue')
  })

  it('Offline driver gets gray color', () => {
    const props = getDriverMarkerProps('Offline', null)
    expect(props.color).toBe('gray')
  })

  it('unknown status falls back to gray', () => {
    const props = getDriverMarkerProps('Unknown', null)
    expect(props.color).toBe('gray')
  })

  it('non-null heading produces rotation in degrees', () => {
    const props = getDriverMarkerProps('Free', 180)
    expect(props.rotation).toBe(180)
    expect(props.hasHeading).toBe(true)
  })

  it('null heading produces no rotation (neutral icon)', () => {
    const props = getDriverMarkerProps('Free', null)
    expect(props.rotation).toBe(0)
    expect(props.hasHeading).toBe(false)
  })

  it('zero heading is a valid heading (not null)', () => {
    const props = getDriverMarkerProps('EnRoute', 0)
    expect(props.rotation).toBe(0)
    expect(props.hasHeading).toBe(true)
  })
})

describe('getMarkerColorToken — semantic CSS-var mapping (dispatcher redesign §2)', () => {
  it('green (Free) maps to var(--success)', () => {
    expect(getMarkerColorToken('green')).toBe('var(--success)')
  })

  it('blue (EnRoute) maps to var(--info)', () => {
    expect(getMarkerColorToken('blue')).toBe('var(--info)')
  })

  it('orange (Busy) maps to var(--warning)', () => {
    expect(getMarkerColorToken('orange')).toBe('var(--warning)')
  })

  it('gray (Offline) maps to var(--ink-3)', () => {
    expect(getMarkerColorToken('gray')).toBe('var(--ink-3)')
  })

  it('never returns a hardcoded hex colour', () => {
    const tokens = (['green', 'blue', 'orange', 'gray'] as const).map(getMarkerColorToken)
    for (const token of tokens) {
      expect(token).not.toMatch(/#[0-9a-f]/i)
      expect(token).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
  })
})

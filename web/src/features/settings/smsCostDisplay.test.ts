import { describe, it, expect } from 'vitest'
import { computeSmsCostDisplay, formatCzk } from './smsCostDisplay'

describe('computeSmsCostDisplay', () => {
  it('computes estimated cost as count * unit cost', () => {
    expect(computeSmsCostDisplay(40, 1, 500).estimatedCostCzk).toBe(40)
    expect(computeSmsCostDisplay(10, 2, 500).estimatedCostCzk).toBe(20)
  })

  it('is ok well below the cap', () => {
    expect(computeSmsCostDisplay(100, 1, 500).level).toBe('ok')
  })

  it('is near at >= 90% of the cap', () => {
    expect(computeSmsCostDisplay(450, 1, 500).level).toBe('near')
    expect(computeSmsCostDisplay(449, 1, 500).level).toBe('ok')
  })

  it('is over at or above the cap', () => {
    expect(computeSmsCostDisplay(500, 1, 500).level).toBe('over')
    expect(computeSmsCostDisplay(600, 1, 500).level).toBe('over')
  })

  it('degrades to ok when the cap is zero or negative (disabled)', () => {
    expect(computeSmsCostDisplay(1000, 1, 0).level).toBe('ok')
    expect(computeSmsCostDisplay(1000, 1, -5).level).toBe('ok')
  })
})

describe('formatCzk', () => {
  it('formats integer CZK in cs-CZ with no decimals', () => {
    const s = formatCzk(1234)
    // cs-CZ uses a non-breaking space grouping + "Kč"; assert the digits + currency are present.
    expect(s).toMatch(/1\s?234/)
    expect(s).toMatch(/Kč/)
    expect(s).not.toMatch(/,00|\.00/)
  })
})

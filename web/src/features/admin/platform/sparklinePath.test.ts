import { describe, it, expect } from 'vitest'
import { sparklinePoints } from './sparklinePath'

describe('sparklinePoints', () => {
  it('returns an empty string for no data', () => {
    expect(sparklinePoints([], 100, 20)).toBe('')
  })

  it('places a single point at the vertical midline', () => {
    // One value → no range; render flat in the middle of the box.
    expect(sparklinePoints([5], 100, 20)).toBe('0,10')
  })

  it('spreads points evenly across the width and inverts the y-axis', () => {
    // Values [0, 10] over width 100, height 20:
    // x steps: 0 and 100. y: max value maps to top (0), min to bottom (height).
    expect(sparklinePoints([0, 10], 100, 20)).toBe('0,20 100,0')
  })

  it('scales intermediate values proportionally', () => {
    // [0, 5, 10] → x: 0, 50, 100; y: 20, 10, 0
    expect(sparklinePoints([0, 5, 10], 100, 20)).toBe('0,20 50,10 100,0')
  })

  it('renders a flat midline when all values are equal', () => {
    // No range → every point at the vertical midline (height / 2).
    expect(sparklinePoints([7, 7, 7], 100, 20)).toBe('0,10 50,10 100,10')
  })
})

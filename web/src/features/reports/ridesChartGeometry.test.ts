import { describe, it, expect } from 'vitest'
import { computeChartBars, DEFAULT_CHART_LAYOUT, type RidesPerDayPoint } from './ridesChartGeometry'

describe('computeChartBars', () => {
  it('returns one bar per point', () => {
    const points: RidesPerDayPoint[] = [
      { date: '2026-09-01', count: 4 },
      { date: '2026-09-02', count: 8 },
      { date: '2026-09-03', count: 2 },
    ]
    const bars = computeChartBars(points)
    expect(bars).toHaveLength(3)
    expect(bars.map(b => b.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })

  it('scales the tallest bar to fill the plot area', () => {
    const bars = computeChartBars([
      { date: 'a', count: 5 },
      { date: 'b', count: 10 },
    ])
    const plot = DEFAULT_CHART_LAYOUT.height - DEFAULT_CHART_LAYOUT.bottomPadding - DEFAULT_CHART_LAYOUT.topPadding
    expect(bars[1]!.height).toBeCloseTo(plot)
    expect(bars[0]!.height).toBeCloseTo(plot / 2)
  })

  it('places the tallest bar flush with the top padding (y grows downward)', () => {
    const bars = computeChartBars([{ date: 'a', count: 10 }])
    expect(bars[0]!.y).toBeCloseTo(DEFAULT_CHART_LAYOUT.topPadding)
  })

  it('produces zero-height bars (never NaN) for an all-zero series', () => {
    const bars = computeChartBars([
      { date: 'a', count: 0 },
      { date: 'b', count: 0 },
    ])
    expect(bars.every(b => b.height === 0)).toBe(true)
    expect(bars.every(b => Number.isFinite(b.y))).toBe(true)
  })

  it('returns an empty array for an empty series', () => {
    expect(computeChartBars([])).toEqual([])
  })

  it('spaces bars evenly across the full width without overlap', () => {
    const bars = computeChartBars([
      { date: 'a', count: 1 },
      { date: 'b', count: 1 },
    ])
    expect(bars[1]!.x).toBeGreaterThan(bars[0]!.x + bars[0]!.width)
    expect(bars[0]!.width).toBeGreaterThan(0)
  })
})

import { describe, it, expect } from 'vitest'
import { buildOverviewChartConfig } from './overviewChart'
import type { TrendBucketDto } from '../../../shared/api/client'

const buckets: TrendBucketDto[] = [
  { bucket: '2026-09-01', rides: 5, revenueCzk: 2500 },
  { bucket: '2026-09-02', rides: 3, revenueCzk: 1500 },
  { bucket: '2026-09-03', rides: 8, revenueCzk: 4000 },
]

describe('buildOverviewChartConfig', () => {
  it('returns labels from bucket dates', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.data.labels).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
  })

  it('returns two datasets — rides (index 0) and revenue (index 1)', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.data.datasets).toHaveLength(2)
  })

  it('rides dataset has correct data', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.data.datasets[0].data).toEqual([5, 3, 8])
    expect(cfg.data.datasets[0].label).toBe('Jízdy')
  })

  it('revenue dataset has correct data', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.data.datasets[1].data).toEqual([2500, 1500, 4000])
    expect(cfg.data.datasets[1].label).toBe('Tržby')
  })

  it('returns empty labels and datasets when series is empty', () => {
    const cfg = buildOverviewChartConfig([], 'Jízdy', 'Tržby')
    expect(cfg.data.labels).toEqual([])
    expect(cfg.data.datasets[0].data).toEqual([])
    expect(cfg.data.datasets[1].data).toEqual([])
  })

  it('config type is line', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.type).toBe('line')
  })

  it('responsive is true', () => {
    const cfg = buildOverviewChartConfig(buckets, 'Jízdy', 'Tržby')
    expect(cfg.options?.responsive).toBe(true)
  })
})

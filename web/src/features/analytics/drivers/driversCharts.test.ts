/**
 * Unit tests for driversCharts.ts — pure Chart.js config builders.
 * No canvas, no React — testable in jsdom.
 */

import { describe, it, expect } from 'vitest'
import type { RetentionBucketDto, DriverWeeklyTrendDto } from '../../../shared/api/client'
import { buildRetentionLineConfig, buildWeeklyTrendLineConfig } from './driversCharts'

const retentionBuckets: RetentionBucketDto[] = [
  { weekStart: '2026-09-01', active: 10, newlyActivated: 3, churned: 1 },
  { weekStart: '2026-09-08', active: 12, newlyActivated: 4, churned: 0 },
]

const weeklyTrend: DriverWeeklyTrendDto[] = [
  { weekStart: '2026-09-01', ridesCompleted: 8, revenueCzk: 4000, avgRating: 4.5 },
  { weekStart: '2026-09-08', ridesCompleted: 12, revenueCzk: 6000, avgRating: null },
]

describe('buildRetentionLineConfig', () => {
  it('returns a line chart type', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.type).toBe('line')
  })

  it('uses weekStart values as labels', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('has 3 datasets: active, newly activated, churned', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.data.datasets).toHaveLength(3)
  })

  it('maps active counts to first dataset', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.data.datasets[0].data).toEqual([10, 12])
  })

  it('maps newlyActivated counts to second dataset', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.data.datasets[1].data).toEqual([3, 4])
  })

  it('maps churned counts to third dataset', () => {
    const config = buildRetentionLineConfig(retentionBuckets)
    expect(config.data.datasets[2].data).toEqual([1, 0])
  })

  it('returns empty labels and datasets for empty input', () => {
    const config = buildRetentionLineConfig([])
    expect(config.data.labels).toEqual([])
    expect(config.data.datasets[0].data).toEqual([])
  })
})

describe('buildWeeklyTrendLineConfig', () => {
  it('returns a line chart type', () => {
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.type).toBe('line')
  })

  it('uses weekStart values as labels', () => {
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('has 2 datasets: rides and revenue', () => {
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.data.datasets).toHaveLength(2)
  })

  it('maps ridesCompleted to first dataset', () => {
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.data.datasets[0].data).toEqual([8, 12])
  })

  it('maps revenueCzk to second dataset', () => {
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.data.datasets[1].data).toEqual([4000, 6000])
  })

  it('handles null avgRating gracefully (not in a dataset)', () => {
    // The builder returns 2 datasets; avgRating is shown via a table, not a dataset
    const config = buildWeeklyTrendLineConfig(weeklyTrend)
    expect(config.data.datasets).toHaveLength(2)
  })
})

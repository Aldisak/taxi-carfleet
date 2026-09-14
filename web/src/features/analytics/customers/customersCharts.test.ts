/**
 * Unit tests for customersCharts.ts — pure Chart.js config builders.
 */

import { describe, it, expect } from 'vitest'
import type { NewVsReturningBucketDto, RatingBucketDto, RatingTrendBucketDto } from '../../../shared/api/client'
import {
  buildNewVsReturningBarConfig,
  buildRatingsDistributionBarConfig,
  buildRatingsTrendLineConfig,
} from './customersCharts'

const newVsReturning: NewVsReturningBucketDto[] = [
  { bucket: '2026-09-01', newRides: 30, returningRides: 70 },
  { bucket: '2026-09-08', newRides: 20, returningRides: 80 },
]

const distribution: RatingBucketDto[] = [
  { stars: 1, count: 5 },
  { stars: 2, count: 8 },
  { stars: 3, count: 12 },
  { stars: 4, count: 40 },
  { stars: 5, count: 60 },
]

const ratingsAvgTrend: RatingTrendBucketDto[] = [
  { bucket: '2026-09-01', rides: 10, avgRating: 4.2 },
  { bucket: '2026-09-08', rides: 15, avgRating: 4.5 },
]

describe('buildNewVsReturningBarConfig', () => {
  it('returns a bar chart type', () => {
    const config = buildNewVsReturningBarConfig(newVsReturning)
    expect(config.type).toBe('bar')
  })

  it('uses bucket strings as labels', () => {
    const config = buildNewVsReturningBarConfig(newVsReturning)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('has 2 datasets: new and returning', () => {
    const config = buildNewVsReturningBarConfig(newVsReturning)
    expect(config.data.datasets).toHaveLength(2)
  })

  it('maps newRides to first dataset', () => {
    const config = buildNewVsReturningBarConfig(newVsReturning)
    expect(config.data.datasets[0].data).toEqual([30, 20])
  })

  it('maps returningRides to second dataset', () => {
    const config = buildNewVsReturningBarConfig(newVsReturning)
    expect(config.data.datasets[1].data).toEqual([70, 80])
  })

  it('returns empty config for empty input', () => {
    const config = buildNewVsReturningBarConfig([])
    expect(config.data.labels).toEqual([])
    expect(config.data.datasets[0].data).toEqual([])
  })
})

describe('buildRatingsDistributionBarConfig', () => {
  it('returns a bar chart type', () => {
    const config = buildRatingsDistributionBarConfig(distribution)
    expect(config.type).toBe('bar')
  })

  it('uses star values as labels', () => {
    const config = buildRatingsDistributionBarConfig(distribution)
    expect(config.data.labels).toEqual(['1', '2', '3', '4', '5'])
  })

  it('has 1 dataset with counts', () => {
    const config = buildRatingsDistributionBarConfig(distribution)
    expect(config.data.datasets).toHaveLength(1)
    expect(config.data.datasets[0].data).toEqual([5, 8, 12, 40, 60])
  })

  it('derives all five bar colors from theme tokens (no hardcoded hex literals)', () => {
    const config = buildRatingsDistributionBarConfig(distribution)
    const colors = config.data.datasets[0].backgroundColor as string[]
    // Every color must be an rgba() string routed through hexToRgba, not a raw hex literal.
    for (const c of colors) {
      expect(c).toMatch(/^rgba\(/)
      expect(c).not.toMatch(/#/)
    }
    // Hue of the 2-star (ratingLow #f97316 → 249,115,22) and 4-star
    // (ratingHigh #a3e635 → 163,230,53) buckets is preserved exactly (opaque).
    expect(colors[1]).toContain('249,115,22')
    expect(colors[3]).toContain('163,230,53')
  })
})

describe('buildRatingsTrendLineConfig', () => {
  it('returns a line chart type', () => {
    const config = buildRatingsTrendLineConfig(ratingsAvgTrend)
    expect(config.type).toBe('line')
  })

  it('uses bucket strings as labels', () => {
    const config = buildRatingsTrendLineConfig(ratingsAvgTrend)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('has 1 dataset with avgRating values (null → 0 or omitted)', () => {
    const config = buildRatingsTrendLineConfig(ratingsAvgTrend)
    expect(config.data.datasets).toHaveLength(1)
    expect(config.data.datasets[0].data).toEqual([4.2, 4.5])
  })
})

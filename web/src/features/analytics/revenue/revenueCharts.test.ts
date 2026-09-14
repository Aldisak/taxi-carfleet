/**
 * Unit tests for revenueCharts.ts — pure Chart.js config builders.
 * No canvas, no React — testable in jsdom.
 */

import { describe, it, expect } from 'vitest'
import type { RevenueBucketDto, AovTrendBucketDto, SmsCostBucketDto } from '../../../shared/api/client'
import {
  buildRevenueStackedBarConfig,
  buildSourceDoughnutConfig,
  buildPriceTypeDoughnutConfig,
  buildAovTrendLineConfig,
  buildSmsCostLineConfig,
} from './revenueCharts'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const bucket1: RevenueBucketDto = {
  bucket: '2026-09-01',
  totalCzk: 650,
  rides: 3,
  cashCzk: 200,
  cardCzk: 300,
  invoiceCzk: 150,
  appCzk: 200,
  phoneCzk: 300,
  dispatcherCzk: 150,
  meterCzk: 200,
  fixedCzk: 300,
  estimateCzk: 150,
}

const bucket2: RevenueBucketDto = {
  bucket: '2026-09-02',
  totalCzk: 400,
  rides: 2,
  cashCzk: 100,
  cardCzk: 200,
  invoiceCzk: 100,
  appCzk: 150,
  phoneCzk: 150,
  dispatcherCzk: 100,
  meterCzk: 100,
  fixedCzk: 200,
  estimateCzk: 100,
}

const aovBuckets: AovTrendBucketDto[] = [
  { bucket: '2026-09-01', aovCzk: 217 },
  { bucket: '2026-09-02', aovCzk: 200 },
]

const smsBuckets: SmsCostBucketDto[] = [
  { bucket: '2026-09-01', smsCount: 10, costCzk: 30 },
  { bucket: '2026-09-02', smsCount: 5, costCzk: 15 },
]

// ── buildRevenueStackedBarConfig ──────────────────────────────────────────────

describe('buildRevenueStackedBarConfig', () => {
  it('returns type bar', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.type).toBe('bar')
  })

  it('uses theme success color for Cash dataset via hexToRgba', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    // hexToRgba(theme.colors.success='#188038', 0.8) → 'rgba(24,128,56,0.8)'
    const bg = config.data.datasets[0].backgroundColor as string
    // Must NOT be the old hardcoded off-theme hex '#1e2a4a'
    expect(bg).not.toContain('#1e2a4a')
    // Must be derived from theme success (#188038 → 24,128,56)
    expect(bg).toContain('24,128,56')
  })

  it('uses theme primary color for Card dataset via hexToRgba', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    // hexToRgba(theme.colors.primary='#1a73e8', 0.8) → 'rgba(26,115,232,0.8)'
    const bg = config.data.datasets[1].backgroundColor as string
    // Must NOT be the old hardcoded off-theme hex
    expect(bg).not.toContain('#1e2a4a')
    // Must be derived from theme primary (#1a73e8 → 26,115,232)
    expect(bg).toContain('26,115,232')
  })

  it('labels are bucket strings', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('has 3 datasets (Cash, Card, Invoice)', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.data.datasets).toHaveLength(3)
  })

  it('first dataset (Cash) sums correct values', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.data.datasets[0].data).toEqual([200, 100])
  })

  it('second dataset (Card) sums correct values', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.data.datasets[1].data).toEqual([300, 200])
  })

  it('third dataset (Invoice) sums correct values', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    expect(config.data.datasets[2].data).toEqual([150, 100])
  })

  it('stacked axis option is set', () => {
    const config = buildRevenueStackedBarConfig([bucket1, bucket2])
    const scales = (config.options as Record<string, unknown>)['scales'] as Record<string, unknown>
    const xAxis = scales['x'] as Record<string, unknown>
    expect(xAxis['stacked']).toBe(true)
  })

  it('handles empty series without throwing', () => {
    expect(() => buildRevenueStackedBarConfig([])).not.toThrow()
    const config = buildRevenueStackedBarConfig([])
    expect(config.data.labels).toEqual([])
  })
})

// ── buildSourceDoughnutConfig ─────────────────────────────────────────────────

describe('buildSourceDoughnutConfig', () => {
  it('returns type doughnut', () => {
    const config = buildSourceDoughnutConfig([bucket1, bucket2])
    expect(config.type).toBe('doughnut')
  })

  it('has 3 slices (App, Phone, Dispatcher)', () => {
    const config = buildSourceDoughnutConfig([bucket1, bucket2])
    expect(config.data.datasets[0].data).toHaveLength(3)
  })

  it('sums App revenue across buckets', () => {
    const config = buildSourceDoughnutConfig([bucket1, bucket2])
    // appCzk: 200 + 150 = 350
    expect(config.data.datasets[0].data[0]).toBe(350)
  })

  it('sums Phone revenue across buckets', () => {
    const config = buildSourceDoughnutConfig([bucket1, bucket2])
    // phoneCzk: 300 + 150 = 450
    expect(config.data.datasets[0].data[1]).toBe(450)
  })

  it('sums Dispatcher revenue across buckets', () => {
    const config = buildSourceDoughnutConfig([bucket1, bucket2])
    // dispatcherCzk: 150 + 100 = 250
    expect(config.data.datasets[0].data[2]).toBe(250)
  })

  it('returns zeros for empty series', () => {
    const config = buildSourceDoughnutConfig([])
    expect(config.data.datasets[0].data).toEqual([0, 0, 0])
  })
})

// ── buildPriceTypeDoughnutConfig ──────────────────────────────────────────────

describe('buildPriceTypeDoughnutConfig', () => {
  it('returns type doughnut', () => {
    const config = buildPriceTypeDoughnutConfig([bucket1, bucket2])
    expect(config.type).toBe('doughnut')
  })

  it('has 3 slices (Meter, Fixed, Estimate)', () => {
    const config = buildPriceTypeDoughnutConfig([bucket1, bucket2])
    expect(config.data.datasets[0].data).toHaveLength(3)
  })

  it('sums Meter revenue across buckets', () => {
    const config = buildPriceTypeDoughnutConfig([bucket1, bucket2])
    // meterCzk: 200 + 100 = 300
    expect(config.data.datasets[0].data[0]).toBe(300)
  })

  it('sums Fixed revenue across buckets', () => {
    const config = buildPriceTypeDoughnutConfig([bucket1, bucket2])
    // fixedCzk: 300 + 200 = 500
    expect(config.data.datasets[0].data[1]).toBe(500)
  })

  it('sums Estimate revenue across buckets', () => {
    const config = buildPriceTypeDoughnutConfig([bucket1, bucket2])
    // estimateCzk: 150 + 100 = 250
    expect(config.data.datasets[0].data[2]).toBe(250)
  })

  it('returns zeros for empty series', () => {
    const config = buildPriceTypeDoughnutConfig([])
    expect(config.data.datasets[0].data).toEqual([0, 0, 0])
  })
})

// ── buildAovTrendLineConfig ───────────────────────────────────────────────────

describe('buildAovTrendLineConfig', () => {
  it('returns type line', () => {
    const config = buildAovTrendLineConfig(aovBuckets)
    expect(config.type).toBe('line')
  })

  it('labels are bucket strings', () => {
    const config = buildAovTrendLineConfig(aovBuckets)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('has one dataset', () => {
    const config = buildAovTrendLineConfig(aovBuckets)
    expect(config.data.datasets).toHaveLength(1)
  })

  it('dataset values are aovCzk', () => {
    const config = buildAovTrendLineConfig(aovBuckets)
    expect(config.data.datasets[0].data).toEqual([217, 200])
  })

  it('handles empty trend without throwing', () => {
    expect(() => buildAovTrendLineConfig([])).not.toThrow()
    const config = buildAovTrendLineConfig([])
    expect(config.data.labels).toEqual([])
  })
})

// ── buildSmsCostLineConfig ────────────────────────────────────────────────────

describe('buildSmsCostLineConfig', () => {
  it('returns type line', () => {
    const config = buildSmsCostLineConfig(smsBuckets)
    expect(config.type).toBe('line')
  })

  it('labels are bucket strings', () => {
    const config = buildSmsCostLineConfig(smsBuckets)
    expect(config.data.labels).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('has one dataset (cost)', () => {
    const config = buildSmsCostLineConfig(smsBuckets)
    expect(config.data.datasets).toHaveLength(1)
  })

  it('dataset values are costCzk', () => {
    const config = buildSmsCostLineConfig(smsBuckets)
    expect(config.data.datasets[0].data).toEqual([30, 15])
  })

  it('handles empty without throwing', () => {
    expect(() => buildSmsCostLineConfig([])).not.toThrow()
    const config = buildSmsCostLineConfig([])
    expect(config.data.labels).toEqual([])
  })
})

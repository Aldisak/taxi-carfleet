import { describe, it, expect } from 'vitest'
import type { HeatmapCellDto, SupplyDemandBucketDto, UnmetDemandBucketDto } from '../../../shared/api/client'
import {
  buildHeatmapChartConfig,
  buildSupplyDemandChartConfig,
  buildUnmetDemandChartConfig,
} from './demandCharts'

describe('buildHeatmapChartConfig', () => {
  it('returns a Bar chart config with one dataset per DOW', () => {
    const cells: HeatmapCellDto[] = [
      { hour: 8, dow: 1, count: 3 }, // Monday
      { hour: 8, dow: 4, count: 5 }, // Thursday
      { hour: 9, dow: 1, count: 2 },
    ]
    const config = buildHeatmapChartConfig(cells)
    expect(config.type).toBe('bar')
    // 7 datasets: one per DOW (0=Sun…6=Sat)
    expect(config.data.datasets).toHaveLength(7)
  })

  it('maps hour labels 0–23 as x-axis', () => {
    const config = buildHeatmapChartConfig([])
    expect(config.data.labels).toHaveLength(24)
    expect(config.data.labels?.[0]).toBe('0:00')
    expect(config.data.labels?.[23]).toBe('23:00')
  })

  it('places counts in the correct dataset (DOW index)', () => {
    const cells: HeatmapCellDto[] = [{ hour: 10, dow: 4, count: 7 }]
    const config = buildHeatmapChartConfig(cells)
    // DOW=4 → dataset index 4 (Thursday)
    const dataset = config.data.datasets[4]
    expect((dataset.data as number[])[10]).toBe(7)
  })

  it('fills unspecified cells with 0', () => {
    const config = buildHeatmapChartConfig([])
    // All counts should be 0
    for (const ds of config.data.datasets) {
      for (const v of ds.data as number[]) {
        expect(v).toBe(0)
      }
    }
  })
})

describe('buildSupplyDemandChartConfig', () => {
  it('returns a Bar chart config with two datasets (orders and online hours)', () => {
    const buckets: SupplyDemandBucketDto[] = [
      { hour: 8, ordersCreated: 10, onlineSeconds: 3600, fulfillmentRate: 0.8 },
      { hour: 9, ordersCreated: 5, onlineSeconds: 1800, fulfillmentRate: 0.9 },
    ]
    const config = buildSupplyDemandChartConfig(buckets)
    expect(config.type).toBe('bar')
    expect(config.data.datasets).toHaveLength(2)
  })

  it('maps hour labels 0–23', () => {
    const config = buildSupplyDemandChartConfig([])
    expect(config.data.labels).toHaveLength(24)
  })

  it('places ordersCreated values in first dataset', () => {
    const buckets: SupplyDemandBucketDto[] = [
      { hour: 8, ordersCreated: 10, onlineSeconds: 3600, fulfillmentRate: 0.8 },
    ]
    const config = buildSupplyDemandChartConfig(buckets)
    const ordersDataset = config.data.datasets[0]
    expect((ordersDataset.data as number[])[8]).toBe(10)
  })

  it('converts onlineSeconds to hours in second dataset', () => {
    const buckets: SupplyDemandBucketDto[] = [
      { hour: 9, ordersCreated: 5, onlineSeconds: 7200, fulfillmentRate: 0.9 },
    ]
    const config = buildSupplyDemandChartConfig(buckets)
    const supplyDataset = config.data.datasets[1]
    // 7200 seconds = 2 hours
    expect((supplyDataset.data as number[])[9]).toBe(2)
  })
})

describe('buildUnmetDemandChartConfig', () => {
  it('returns a Bar chart config with one dataset', () => {
    const buckets: UnmetDemandBucketDto[] = [
      { hour: 10, unmetCount: 3 },
    ]
    const config = buildUnmetDemandChartConfig(buckets)
    expect(config.type).toBe('bar')
    expect(config.data.datasets).toHaveLength(1)
  })

  it('maps hour labels 0–23', () => {
    const config = buildUnmetDemandChartConfig([])
    expect(config.data.labels).toHaveLength(24)
  })

  it('places unmetCount in the correct hour slot', () => {
    const buckets: UnmetDemandBucketDto[] = [
      { hour: 15, unmetCount: 8 },
    ]
    const config = buildUnmetDemandChartConfig(buckets)
    const dataset = config.data.datasets[0]
    expect((dataset.data as number[])[15]).toBe(8)
  })

  it('fills missing hours with 0', () => {
    const config = buildUnmetDemandChartConfig([])
    for (const v of config.data.datasets[0].data as number[]) {
      expect(v).toBe(0)
    }
  })
})

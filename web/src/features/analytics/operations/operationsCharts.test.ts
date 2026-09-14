/**
 * Pure unit tests for operationsCharts.ts config builders.
 * No Canvas, no react-chartjs-2 — just plain TypeScript functions.
 */

import { describe, it, expect } from 'vitest'
import {
  buildSlaBarChartConfig,
  buildOfferFunnelChartConfig,
  buildLifecycleFunnelChartConfig,
  buildCancellationDoughnutChartConfig,
} from './operationsCharts'
import type { OperationsSlaDto, OfferFunnelDto, LifecycleFunnelDto, CancellationBreakdownDto } from '../../../shared/api/client'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SLA_FULL: OperationsSlaDto = {
  timeToAssign: { median: 60, p90: 120, sampleCount: 10 },
  timeToAccept: { median: 30, p90: 90, sampleCount: 8 },
  timeToPickup: { median: 300, p90: 600, sampleCount: 7 },
  rideDuration: { median: 1200, p90: 2400, sampleCount: 6 },
}

const SLA_PARTIAL: OperationsSlaDto = {
  timeToAssign: null,
  timeToAccept: { median: 45, p90: 95, sampleCount: 3 },
  timeToPickup: null,
  rideDuration: { median: 900, p90: 1800, sampleCount: 4 },
}

const SLA_EMPTY: OperationsSlaDto = {
  timeToAssign: null,
  timeToAccept: null,
  timeToPickup: null,
  rideDuration: null,
}

const OFFER_FUNNEL: OfferFunnelDto = {
  offersMade: 100,
  accepted: 80,
  declined: 10,
  timeouts: 10,
  avgOffersPerCompleted: 1.25,
}

const LIFECYCLE: LifecycleFunnelDto = {
  created: 200,
  assigned: 180,
  accepted: 160,
  arrived: 150,
  inProgress: 140,
  completed: 120,
}

const CANCELLATIONS: CancellationBreakdownDto = {
  byRole: [
    { role: 'Customer', count: 15 },
    { role: 'Driver', count: 5 },
    { role: 'Dispatcher', count: 3 },
  ],
  byStatusAtCancel: [
    { status: 'New', count: 8 },
    { status: 'Assigned', count: 10 },
    { status: 'Accepted', count: 5 },
  ],
  byHour: [
    { hour: 8, count: 4 },
    { hour: 12, count: 7 },
    { hour: 18, count: 5 },
  ],
  noShowShare: 0.217,
}

// ── SLA bar chart ─────────────────────────────────────────────────────────────

describe('buildSlaBarChartConfig', () => {
  it('returns a grouped bar chart with 4 metric labels', () => {
    const config = buildSlaBarChartConfig(SLA_FULL)
    expect(config.type).toBe('bar')
    expect(config.data.labels).toHaveLength(4)
  })

  it('has two datasets: p50 and p90', () => {
    const config = buildSlaBarChartConfig(SLA_FULL)
    expect(config.data.datasets).toHaveLength(2)
    expect(config.data.datasets[0].label).toMatch(/p50/i)
    expect(config.data.datasets[1].label).toMatch(/p90/i)
  })

  it('converts seconds to minutes in p50 dataset for full SLA', () => {
    const config = buildSlaBarChartConfig(SLA_FULL)
    const p50 = config.data.datasets[0].data
    // timeToAssign p50 = 60s → 1.0 min
    expect(p50[0]).toBeCloseTo(1.0, 1)
    // timeToAccept p50 = 30s → 0.5 min
    expect(p50[1]).toBeCloseTo(0.5, 1)
    // timeToPickup p50 = 300s → 5.0 min
    expect(p50[2]).toBeCloseTo(5.0, 1)
    // rideDuration p50 = 1200s → 20.0 min
    expect(p50[3]).toBeCloseTo(20.0, 1)
  })

  it('converts seconds to minutes in p90 dataset for full SLA', () => {
    const config = buildSlaBarChartConfig(SLA_FULL)
    const p90 = config.data.datasets[1].data
    // timeToAssign p90 = 120s → 2.0 min
    expect(p90[0]).toBeCloseTo(2.0, 1)
    // rideDuration p90 = 2400s → 40.0 min
    expect(p90[3]).toBeCloseTo(40.0, 1)
  })

  it('uses 0 (not NaN) for null SLA metrics', () => {
    const config = buildSlaBarChartConfig(SLA_PARTIAL)
    const p50 = config.data.datasets[0].data
    const p90 = config.data.datasets[1].data
    // timeToAssign = null → 0
    expect(p50[0]).toBe(0)
    expect(p90[0]).toBe(0)
    // timeToPickup = null → 0
    expect(p50[2]).toBe(0)
    expect(p90[2]).toBe(0)
  })

  it('returns 4 zero values when all SLA metrics are null', () => {
    const config = buildSlaBarChartConfig(SLA_EMPTY)
    const p50 = config.data.datasets[0].data
    const p90 = config.data.datasets[1].data
    expect(p50).toEqual([0, 0, 0, 0])
    expect(p90).toEqual([0, 0, 0, 0])
  })
})

// ── Offer funnel chart ─────────────────────────────────────────────────────────

describe('buildOfferFunnelChartConfig', () => {
  it('returns a horizontal bar chart (indexAxis y)', () => {
    const config = buildOfferFunnelChartConfig(OFFER_FUNNEL)
    expect(config.type).toBe('bar')
    expect((config.options as Record<string, unknown>)?.indexAxis).toBe('y')
  })

  it('has one dataset with 4 values: offersMade, accepted, declined, timeouts', () => {
    const config = buildOfferFunnelChartConfig(OFFER_FUNNEL)
    expect(config.data.datasets).toHaveLength(1)
    expect(config.data.datasets[0].data).toHaveLength(4)
    expect(config.data.datasets[0].data).toContain(100) // offersMade
    expect(config.data.datasets[0].data).toContain(80)  // accepted
    expect(config.data.datasets[0].data).toContain(10)  // declined (and timeouts)
  })

  it('labels match the 4 funnel stages', () => {
    const config = buildOfferFunnelChartConfig(OFFER_FUNNEL)
    expect(config.data.labels).toHaveLength(4)
  })

  it('orders the data as: offersMade, accepted, declined, timeouts', () => {
    const config = buildOfferFunnelChartConfig(OFFER_FUNNEL)
    const data = config.data.datasets[0].data
    expect(data[0]).toBe(100) // offersMade
    expect(data[1]).toBe(80)  // accepted
    expect(data[2]).toBe(10)  // declined
    expect(data[3]).toBe(10)  // timeouts
  })
})

// ── Lifecycle funnel chart ─────────────────────────────────────────────────────

describe('buildLifecycleFunnelChartConfig', () => {
  it('returns a horizontal bar chart (indexAxis y)', () => {
    const config = buildLifecycleFunnelChartConfig(LIFECYCLE)
    expect(config.type).toBe('bar')
    expect((config.options as Record<string, unknown>)?.indexAxis).toBe('y')
  })

  it('has 6 stage labels', () => {
    const config = buildLifecycleFunnelChartConfig(LIFECYCLE)
    expect(config.data.labels).toHaveLength(6)
  })

  it('has one dataset with 6 values in order: created→completed', () => {
    const config = buildLifecycleFunnelChartConfig(LIFECYCLE)
    const data = config.data.datasets[0].data
    expect(data).toEqual([200, 180, 160, 150, 140, 120])
  })
})

// ── Cancellation doughnut ─────────────────────────────────────────────────────

describe('buildCancellationDoughnutChartConfig', () => {
  it('returns a doughnut chart type', () => {
    const config = buildCancellationDoughnutChartConfig(CANCELLATIONS)
    expect(config.type).toBe('doughnut')
  })

  it('has one dataset with count per role', () => {
    const config = buildCancellationDoughnutChartConfig(CANCELLATIONS)
    expect(config.data.datasets).toHaveLength(1)
    expect(config.data.datasets[0].data).toHaveLength(3)
    expect(config.data.datasets[0].data).toContain(15) // Customer
    expect(config.data.datasets[0].data).toContain(5)  // Driver
    expect(config.data.datasets[0].data).toContain(3)  // Dispatcher
  })

  it('labels match the role names from ByRole', () => {
    const config = buildCancellationDoughnutChartConfig(CANCELLATIONS)
    expect(config.data.labels).toEqual(['Customer', 'Driver', 'Dispatcher'])
  })

  it('has backgroundColor array with one color per role', () => {
    const config = buildCancellationDoughnutChartConfig(CANCELLATIONS)
    const bg = config.data.datasets[0].backgroundColor
    expect(Array.isArray(bg)).toBe(true)
    expect((bg as string[]).length).toBe(3)
  })

  it('returns an empty dataset for empty byRole', () => {
    const empty: CancellationBreakdownDto = {
      ...CANCELLATIONS,
      byRole: [],
    }
    const config = buildCancellationDoughnutChartConfig(empty)
    expect(config.data.datasets[0].data).toEqual([])
    expect(config.data.labels).toEqual([])
  })
})

/**
 * Pure chart config builders for the Drivers (Řidiči) analytics tab.
 *
 * These functions return Chart.js ChartConfiguration objects without importing
 * react-chartjs-2, so they can be unit-tested in jsdom without a canvas.
 *
 * Colors are derived from the shared `theme` object to keep charts consistent.
 */

import { theme } from '../../../shared/theme/theme'
import type { RetentionBucketDto, DriverWeeklyTrendDto } from '../../../shared/api/client'
import type { ChartConfig } from '../demand/demandCharts'

export type { ChartConfig }

// ── Palette helpers ───────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const COLOR_ACTIVE = hexToRgba(theme.colors.primary, 0.8)
const COLOR_NEW = hexToRgba(theme.colors.success, 0.8)
const COLOR_CHURNED = hexToRgba(theme.colors.error, 0.8)
const COLOR_RIDES = hexToRgba(theme.colors.primary, 0.85)
const COLOR_REVENUE = hexToRgba(theme.colors.success, 0.8)

// ── Driver retention line chart ───────────────────────────────────────────────

/**
 * Builds a multi-line retention chart config showing active, newly activated,
 * and churned drivers per ISO week.
 *
 * @param buckets - Retention buckets from the drivers analytics endpoint.
 * @param activeLabel - Optional label override for the active series.
 * @param newLabel - Optional label override for the newly activated series.
 * @param churnedLabel - Optional label override for the churned series.
 */
export function buildRetentionLineConfig(
  buckets: RetentionBucketDto[],
  activeLabel = 'Aktivní',
  newLabel = 'Nově aktivní',
  churnedLabel = 'Odchod',
): ChartConfig {
  return {
    type: 'line',
    data: {
      labels: buckets.map(b => b.weekStart),
      datasets: [
        {
          label: activeLabel,
          data: buckets.map(b => b.active),
          borderColor: COLOR_ACTIVE,
          backgroundColor: hexToRgba(theme.colors.primary, 0.12),
          borderWidth: 2,
          ...(({ fill: true, tension: 0.3, pointRadius: 3 } as Record<string, unknown>)),
        },
        {
          label: newLabel,
          data: buckets.map(b => b.newlyActivated),
          borderColor: COLOR_NEW,
          backgroundColor: hexToRgba(theme.colors.success, 0.12),
          borderWidth: 2,
          ...(({ fill: false, tension: 0.3, pointRadius: 3 } as Record<string, unknown>)),
        },
        {
          label: churnedLabel,
          data: buckets.map(b => b.churned),
          borderColor: COLOR_CHURNED,
          backgroundColor: hexToRgba(theme.colors.error, 0.12),
          borderWidth: 2,
          ...(({ fill: false, tension: 0.3, pointRadius: 3 } as Record<string, unknown>)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
    },
  }
}

// ── Driver drill-down weekly trend line chart ─────────────────────────────────

/**
 * Builds a dual-axis line chart showing rides completed and revenue per week
 * for a single driver's drill-down view.
 *
 * avgRating is shown via an accessible data table in the component, not as a
 * chart dataset (nullable values make it impractical to overlay on the same axes).
 *
 * @param trend - Weekly trend rows from the drill-down endpoint.
 * @param ridesLabel - Optional label override for the rides series.
 * @param revenueLabel - Optional label override for the revenue series.
 */
export function buildWeeklyTrendLineConfig(
  trend: DriverWeeklyTrendDto[],
  ridesLabel = 'Jízdy',
  revenueLabel = 'Tržby (Kč)',
): ChartConfig {
  return {
    type: 'line',
    data: {
      labels: trend.map(t => t.weekStart),
      datasets: [
        {
          label: ridesLabel,
          data: trend.map(t => t.ridesCompleted),
          borderColor: COLOR_RIDES,
          backgroundColor: hexToRgba(theme.colors.primary, 0.12),
          borderWidth: 2,
          ...(({ tension: 0.3, pointRadius: 3 } as Record<string, unknown>)),
        },
        {
          label: revenueLabel,
          data: trend.map(t => t.revenueCzk),
          borderColor: COLOR_REVENUE,
          backgroundColor: hexToRgba(theme.colors.success, 0.12),
          borderWidth: 2,
          ...(({ tension: 0.3, pointRadius: 3, yAxisID: 'y1' } as Record<string, unknown>)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
    },
  }
}

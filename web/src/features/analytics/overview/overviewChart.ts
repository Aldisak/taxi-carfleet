/**
 * Pure config builder for the Overview tab Line chart.
 *
 * Deliberately has NO imports from react-chartjs-2 or chart.js — those live in
 * registerCharts.ts (auto-registered) and the Chart component import sites.
 * This module is safe to unit-test in jsdom without mocking canvas.
 */

import { theme } from '../../../shared/theme/theme'
import type { TrendBucketDto } from '../../../shared/api/client'

/** Minimal subset of Chart.js ChartConfiguration needed by the Overview chart. */
export interface OverviewChartConfig {
  type: 'line'
  data: {
    labels: string[]
    datasets: {
      label: string
      data: number[]
      yAxisID?: string
      fill?: boolean
      tension?: number
      borderColor?: string
      backgroundColor?: string
    }[]
  }
  options?: {
    responsive?: boolean
    interaction?: {
      mode?: string
      intersect?: boolean
    }
    scales?: Record<string, unknown>
    plugins?: Record<string, unknown>
  }
}

/**
 * Builds a Chart.js Line chart configuration for the Overview tab trend.
 *
 * @param series - Time-bucketed ride and revenue data from the API.
 * @param ridesLabel - Translated label for the rides dataset (e.g. "Jízdy").
 * @param revenueLabel - Translated label for the revenue dataset (e.g. "Tržby").
 */
export function buildOverviewChartConfig(
  series: TrendBucketDto[],
  ridesLabel: string,
  revenueLabel: string,
): OverviewChartConfig {
  const labels = series.map(b => b.bucket)
  const ridesData = series.map(b => b.rides)
  const revenueData = series.map(b => b.revenueCzk)

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: ridesLabel,
          data: ridesData,
          yAxisID: 'yRides',
          fill: false,
          tension: 0.3,
          borderColor: theme.colors.primary,
          backgroundColor: 'rgba(26,115,232,0.1)',
        },
        {
          label: revenueLabel,
          data: revenueData,
          yAxisID: 'yRevenue',
          fill: false,
          tension: 0.3,
          borderColor: theme.colors.success,
          backgroundColor: 'rgba(24,128,56,0.1)',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        yRides: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
        },
        yRevenue: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
        },
      },
    },
  }
}

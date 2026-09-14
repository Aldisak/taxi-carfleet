/**
 * Pure chart config builders for the Demand analytics tab.
 *
 * These functions return Chart.js ChartConfiguration objects without importing
 * react-chartjs-2, so they can be unit-tested in jsdom without a canvas.
 *
 * DOW convention: 0=Sunday … 6=Saturday (Postgres EXTRACT(DOW) convention).
 * Czech display order is Monday-first, but we index datasets by DOW (0–6) to
 * match the backend directly, and label each dataset with the Czech day name.
 */

import type { HeatmapCellDto, SupplyDemandBucketDto, UnmetDemandBucketDto } from '../../../shared/api/client'

// Chart.js ChartConfiguration-like type (avoid importing full chart.js in this pure module)
export interface ChartConfig {
  type: 'bar' | 'line' | 'doughnut'
  data: {
    labels?: string[]
    datasets: Array<{
      label?: string
      data: number[]
      backgroundColor?: string | string[]
      borderColor?: string | string[]
      borderWidth?: number
      stack?: string
      borderRadius?: number
    }>
  }
  options?: Record<string, unknown>
}

// DOW labels: index 0=Sunday … 6=Saturday (Czech abbreviated names)
const DOW_LABELS_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']

// Colour palette for DOW datasets (7 distinct colours, warm tones for heatmap)
const DOW_COLORS = [
  'rgba(251,191,36,0.7)',   // Sunday    - amber
  'rgba(59,130,246,0.7)',   // Monday    - blue
  'rgba(16,185,129,0.7)',   // Tuesday   - emerald
  'rgba(236,72,153,0.7)',   // Wednesday - pink
  'rgba(245,101,43,0.7)',   // Thursday  - orange
  'rgba(139,92,246,0.7)',   // Friday    - violet
  'rgba(239,68,68,0.7)',    // Saturday  - red
]

/** Hour labels 0:00–23:00. */
function hourLabels(): string[] {
  return Array.from({ length: 24 }, (_, i) => `${i}:00`)
}

/** Zeros array of length 24. */
function zeros(): number[] {
  return new Array<number>(24).fill(0)
}

/**
 * Builds a stacked/grouped Bar chart config for the hour×DOW heatmap.
 *
 * One dataset per DOW (0=Sunday … 6=Saturday), x-axis = hour of day (0–23).
 * Uses bars as a visual heatmap fallback (no chartjs-chart-matrix dependency).
 */
export function buildHeatmapChartConfig(cells: HeatmapCellDto[]): ChartConfig {
  // Initialise 7 DOW datasets with zero counts for each of 24 hours
  const counts: number[][] = Array.from({ length: 7 }, () => zeros())

  for (const cell of cells) {
    if (cell.dow >= 0 && cell.dow <= 6 && cell.hour >= 0 && cell.hour <= 23) {
      counts[cell.dow][cell.hour] = cell.count
    }
  }

  const datasets = DOW_LABELS_CS.map((label, dow) => ({
    label,
    data: counts[dow],
    backgroundColor: DOW_COLORS[dow],
    borderColor: DOW_COLORS[dow],
    borderWidth: 1,
    stack: 'heatmap',
    borderRadius: 2,
  }))

  return {
    type: 'bar',
    data: {
      labels: hourLabels(),
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: false },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true },
      },
    },
  }
}

/**
 * Builds a grouped Bar chart config for supply vs demand per Prague hour-of-day.
 *
 * Dataset 0 = orders created (demand), Dataset 1 = driver online hours (supply).
 * Online seconds are converted to hours for readability.
 */
export function buildSupplyDemandChartConfig(buckets: SupplyDemandBucketDto[]): ChartConfig {
  const ordersData = zeros()
  const supplyHoursData = zeros()

  for (const b of buckets) {
    if (b.hour >= 0 && b.hour <= 23) {
      ordersData[b.hour] = b.ordersCreated
      supplyHoursData[b.hour] = Math.round((b.onlineSeconds / 3600) * 100) / 100
    }
  }

  return {
    type: 'bar',
    data: {
      labels: hourLabels(),
      datasets: [
        {
          label: 'Poptávka (jízdy)',
          data: ordersData,
          backgroundColor: 'rgba(59,130,246,0.7)',
          borderColor: 'rgba(59,130,246,1)',
          borderWidth: 1,
          borderRadius: 2,
        },
        {
          label: 'Nabídka (hod. online)',
          data: supplyHoursData,
          backgroundColor: 'rgba(16,185,129,0.7)',
          borderColor: 'rgba(16,185,129,1)',
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: false },
      },
      scales: {
        x: { stacked: false },
        y: { stacked: false },
      },
    },
  }
}

/**
 * Builds a Bar chart config for unmet demand per Prague hour-of-day.
 *
 * One dataset: unmet order count (cancelled with no Accepted event).
 */
export function buildUnmetDemandChartConfig(buckets: UnmetDemandBucketDto[]): ChartConfig {
  const unmetData = zeros()

  for (const b of buckets) {
    if (b.hour >= 0 && b.hour <= 23) {
      unmetData[b.hour] = b.unmetCount
    }
  }

  return {
    type: 'bar',
    data: {
      labels: hourLabels(),
      datasets: [
        {
          label: 'Nevyřízená poptávka',
          data: unmetData,
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderColor: 'rgba(239,68,68,1)',
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
    },
  }
}

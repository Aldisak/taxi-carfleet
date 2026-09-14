/**
 * Pure chart config builders for the Operations analytics tab.
 *
 * These functions return Chart.js ChartConfiguration objects without importing
 * react-chartjs-2, so they can be unit-tested in jsdom without a canvas.
 *
 * SLA note: the backend returns one scalar SlaPercentileDto (or null) per metric —
 * NOT a time-series. We visualize as a grouped bar chart with 4 metrics on the
 * x-axis and two series (p50/p90). Null metrics map to 0 (no data bar) so the
 * chart is always well-formed. The visible table shows "—" for null metrics.
 *
 * Offer funnel and lifecycle funnel use horizontal bars (indexAxis: 'y') per spec §8.
 */

import type {
  OperationsSlaDto,
  OfferFunnelDto,
  LifecycleFunnelDto,
  CancellationBreakdownDto,
} from '../../../shared/api/client'
import type { ChartConfig } from '../demand/demandCharts'

// Re-export so callers can import ChartConfig from either module
export type { ChartConfig }

// ── Palette ───────────────────────────────────────────────────────────────────

const COLOR_P50 = 'rgba(59,130,246,0.75)'     // blue
const COLOR_P90 = 'rgba(245,101,43,0.75)'     // orange
const COLOR_FUNNEL = 'rgba(16,185,129,0.75)'  // emerald
const COLOR_LIFECYCLE = 'rgba(59,130,246,0.75)' // blue

const DOUGHNUT_COLORS = [
  'rgba(239,68,68,0.8)',    // red   – Customer
  'rgba(245,101,43,0.8)',   // orange – Driver
  'rgba(139,92,246,0.8)',   // violet – Dispatcher / System / other
  'rgba(59,130,246,0.8)',   // blue
  'rgba(16,185,129,0.8)',   // emerald
  'rgba(251,191,36,0.8)',   // amber
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts seconds to minutes, rounded to 1 decimal place. */
function secToMin(s: number): number {
  return Math.round((s / 60) * 10) / 10
}

// ── SLA grouped bar chart ─────────────────────────────────────────────────────

/** Czech metric labels for the 4 SLA metrics. */
const SLA_METRIC_LABELS = [
  'Čas k přiřazení',
  'Čas k přijetí',
  'Čas k vyzvednutí',
  'Délka jízdy',
]

/**
 * Builds a grouped Bar chart config for SLA p50/p90 across the 4 metrics.
 *
 * X-axis = 4 metrics; two series: p50 (median) and p90.
 * Values are in minutes (converted from seconds for readability).
 * Null metrics produce 0 in the chart; the visible table shows "—".
 */
export function buildSlaBarChartConfig(sla: OperationsSlaDto): ChartConfig {
  const metrics = [sla.timeToAssign, sla.timeToAccept, sla.timeToPickup, sla.rideDuration]

  const p50Data = metrics.map(m => (m !== null ? secToMin(m.median) : 0))
  const p90Data = metrics.map(m => (m !== null ? secToMin(m.p90) : 0))

  return {
    type: 'bar',
    data: {
      labels: SLA_METRIC_LABELS,
      datasets: [
        {
          label: 'p50 (medián)',
          data: p50Data,
          backgroundColor: COLOR_P50,
          borderColor: COLOR_P50,
          borderWidth: 1,
          borderRadius: 2,
        },
        {
          label: 'p90',
          data: p90Data,
          backgroundColor: COLOR_P90,
          borderColor: COLOR_P90,
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: 'x',
      plugins: {
        legend: { position: 'top' },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: Record<string, unknown>) =>
              `${String(ctx['dataset'] && (ctx['dataset'] as Record<string, unknown>)['label'])}: ${String(ctx['formattedValue'])} min`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Minuty' },
          beginAtZero: true,
        },
      },
    },
  }
}

// ── Offer funnel horizontal bar ───────────────────────────────────────────────

/** Czech stage labels for the offer funnel. */
const OFFER_FUNNEL_LABELS = ['Nabídky odeslány', 'Přijato', 'Odmítnuto', 'Vypršení']

/**
 * Builds a horizontal Bar chart config for the offer funnel.
 *
 * Shows how many offers resulted in acceptance, declination, or timeout.
 * Uses indexAxis: 'y' for horizontal orientation per spec §8.
 */
export function buildOfferFunnelChartConfig(funnel: OfferFunnelDto): ChartConfig {
  return {
    type: 'bar',
    data: {
      labels: OFFER_FUNNEL_LABELS,
      datasets: [
        {
          label: 'Počet',
          data: [funnel.offersMade, funnel.accepted, funnel.declined, funnel.timeouts],
          backgroundColor: COLOR_FUNNEL,
          borderColor: COLOR_FUNNEL,
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: { beginAtZero: true },
      },
    },
  }
}

// ── Lifecycle funnel horizontal bar ──────────────────────────────────────────

/** Czech stage labels for the lifecycle funnel. */
const LIFECYCLE_LABELS = ['Vytvořeno', 'Přiřazeno', 'Přijato', 'Na místě', 'Probíhá', 'Dokončeno']

/**
 * Builds a horizontal Bar chart config for the lifecycle funnel.
 *
 * Shows order counts at each lifecycle stage — conversion drop-offs are visible
 * as the bars get shorter. Uses indexAxis: 'y' for horizontal orientation.
 */
export function buildLifecycleFunnelChartConfig(lifecycle: LifecycleFunnelDto): ChartConfig {
  return {
    type: 'bar',
    data: {
      labels: LIFECYCLE_LABELS,
      datasets: [
        {
          label: 'Počet objednávek',
          data: [
            lifecycle.created,
            lifecycle.assigned,
            lifecycle.accepted,
            lifecycle.arrived,
            lifecycle.inProgress,
            lifecycle.completed,
          ],
          backgroundColor: COLOR_LIFECYCLE,
          borderColor: COLOR_LIFECYCLE,
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: { beginAtZero: true },
      },
    },
  }
}

// ── Cancellation doughnut ─────────────────────────────────────────────────────

/**
 * Builds a Doughnut chart config for cancellations broken down by actor role.
 *
 * Each slice = one role (Customer / Driver / Dispatcher / System).
 * Colors are cycled from the DOUGHNUT_COLORS palette.
 */
export function buildCancellationDoughnutChartConfig(cancellations: CancellationBreakdownDto): ChartConfig {
  const labels = cancellations.byRole.map(r => r.role)
  const data = cancellations.byRole.map(r => r.count)
  const backgroundColor = cancellations.byRole.map((_, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length])

  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: false },
      },
    },
  }
}

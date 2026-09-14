/**
 * Pure chart config builders for the Revenue (Tržby) analytics tab.
 *
 * These functions return Chart.js ChartConfiguration objects without importing
 * react-chartjs-2, so they can be unit-tested in jsdom without a canvas.
 *
 * Colors are derived from the shared `theme` object (theme.colors.*) to keep
 * revenue charts consistent with the application palette and avoid hardcoded literals.
 */

import { theme } from '../../../shared/theme/theme'
import { formatCzk } from '../../../shared/format/money'
import type { RevenueBucketDto, AovTrendBucketDto, SmsCostBucketDto } from '../../../shared/api/client'
import type { ChartConfig } from '../demand/demandCharts'

// Re-export so callers can import ChartConfig from either module
export type { ChartConfig }

// ── Palette helpers ───────────────────────────────────────────────────────────

/**
 * Converts a 6-digit hex color to an rgba() string with the given alpha.
 * e.g. hexToRgba('#1a73e8', 0.8) → 'rgba(26,115,232,0.8)'
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Payment type colors derived from theme
/** Cash payments — success green */
const COLOR_CASH = hexToRgba(theme.colors.success, 0.8)
/** Card payments — primary blue */
const COLOR_CARD = hexToRgba(theme.colors.primary, 0.8)
/** Invoice payments — violet accent from theme */
const COLOR_INVOICE = theme.colors.accentViolet

// Order source colors derived from theme
/** App source — primary blue */
const COLOR_APP = hexToRgba(theme.colors.primary, 0.8)
/** Phone source — warning amber */
const COLOR_PHONE = hexToRgba(theme.colors.warning, 0.85)
/** Dispatcher source — matches invoice color for consistency */
const COLOR_DISPATCHER = theme.colors.accentViolet

// Price type colors derived from theme
/** Meter price type — primary blue */
const COLOR_METER = hexToRgba(theme.colors.primary, 0.8)
/** Fixed price type — success green */
const COLOR_FIXED = hexToRgba(theme.colors.success, 0.8)
/** Estimate price type — warning amber */
const COLOR_ESTIMATE = hexToRgba(theme.colors.warning, 0.85)

/** AOV trend line — primary blue with fill */
const COLOR_AOV = hexToRgba(theme.colors.primary, 0.9)
const COLOR_AOV_FILL = hexToRgba(theme.colors.primary, 0.12)

/** SMS cost line — error red with fill */
const COLOR_SMS = hexToRgba(theme.colors.error, 0.8)
const COLOR_SMS_FILL = hexToRgba(theme.colors.error, 0.1)

// ── buildRevenueStackedBarConfig ──────────────────────────────────────────────

/**
 * Builds a stacked Bar chart config for revenue broken down by payment type
 * (Cash / Card / Invoice) across time buckets.
 *
 * @param series - Time-bucketed revenue data from the API.
 * @param cashLabel - Translated label for Cash dataset.
 * @param cardLabel - Translated label for Card dataset.
 * @param invoiceLabel - Translated label for Invoice dataset.
 */
export function buildRevenueStackedBarConfig(
  series: RevenueBucketDto[],
  cashLabel = 'Hotovost',
  cardLabel = 'Karta',
  invoiceLabel = 'Faktura',
): ChartConfig {
  const labels = series.map(b => b.bucket)

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: cashLabel,
          data: series.map(b => b.cashCzk),
          backgroundColor: COLOR_CASH,
          borderColor: COLOR_CASH,
          borderWidth: 1,
          borderRadius: 2,
          stack: 'revenue',
        },
        {
          label: cardLabel,
          data: series.map(b => b.cardCzk),
          backgroundColor: COLOR_CARD,
          borderColor: COLOR_CARD,
          borderWidth: 1,
          borderRadius: 2,
          stack: 'revenue',
        },
        {
          label: invoiceLabel,
          data: series.map(b => b.invoiceCzk),
          backgroundColor: COLOR_INVOICE,
          borderColor: COLOR_INVOICE,
          borderWidth: 1,
          borderRadius: 2,
          stack: 'revenue',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: Record<string, unknown>) => {
              const label = String(
                (ctx['dataset'] as Record<string, unknown>)?.['label'] ?? ''
              )
              const val = Number(ctx['raw'] ?? 0)
              return `${label}: ${formatCzk(val)}`
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback: (value: unknown) => formatCzk(Number(value)),
          },
        },
      },
    },
  }
}

// ── buildSourceDoughnutConfig ─────────────────────────────────────────────────

/**
 * Builds a Doughnut chart config showing revenue share by order source
 * (App / Phone / Dispatcher) — summed across all series buckets.
 *
 * @param series - Time-bucketed revenue data from the API.
 * @param appLabel - Translated label for App source.
 * @param phoneLabel - Translated label for Phone source.
 * @param dispatcherLabel - Translated label for Dispatcher source.
 */
export function buildSourceDoughnutConfig(
  series: RevenueBucketDto[],
  appLabel = 'Aplikace',
  phoneLabel = 'Telefon',
  dispatcherLabel = 'Dispečink',
): ChartConfig {
  const appTotal = series.reduce((s, b) => s + b.appCzk, 0)
  const phoneTotal = series.reduce((s, b) => s + b.phoneCzk, 0)
  const dispatcherTotal = series.reduce((s, b) => s + b.dispatcherCzk, 0)

  return {
    type: 'doughnut',
    data: {
      labels: [appLabel, phoneLabel, dispatcherLabel],
      datasets: [
        {
          data: [appTotal, phoneTotal, dispatcherTotal],
          backgroundColor: [COLOR_APP, COLOR_PHONE, COLOR_DISPATCHER],
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

// ── buildPriceTypeDoughnutConfig ──────────────────────────────────────────────

/**
 * Builds a Doughnut chart config showing revenue share by price type
 * (Meter / Fixed / Estimate) — summed across all series buckets.
 *
 * @param series - Time-bucketed revenue data from the API.
 * @param meterLabel - Translated label for Meter price type.
 * @param fixedLabel - Translated label for Fixed price type.
 * @param estimateLabel - Translated label for Estimate price type.
 *
 * Note: backend uses PriceType.Estimate (not "Estimated").
 */
export function buildPriceTypeDoughnutConfig(
  series: RevenueBucketDto[],
  meterLabel = 'Taxametr',
  fixedLabel = 'Pevná cena',
  estimateLabel = 'Odhad',
): ChartConfig {
  const meterTotal = series.reduce((s, b) => s + b.meterCzk, 0)
  const fixedTotal = series.reduce((s, b) => s + b.fixedCzk, 0)
  const estimateTotal = series.reduce((s, b) => s + b.estimateCzk, 0)

  return {
    type: 'doughnut',
    data: {
      labels: [meterLabel, fixedLabel, estimateLabel],
      datasets: [
        {
          data: [meterTotal, fixedTotal, estimateTotal],
          backgroundColor: [COLOR_METER, COLOR_FIXED, COLOR_ESTIMATE],
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

// ── buildAovTrendLineConfig ───────────────────────────────────────────────────

/**
 * Builds a Line chart config showing the Average Order Value (AOV) trend
 * across time buckets. Values are integer CZK.
 *
 * @param trend - AOV per time bucket from the API.
 * @param aovLabel - Translated dataset label (e.g. "AOV").
 */
export function buildAovTrendLineConfig(trend: AovTrendBucketDto[], aovLabel = 'AOV (Kč)'): ChartConfig {
  return {
    type: 'line',
    data: {
      labels: trend.map(b => b.bucket),
      datasets: [
        {
          label: aovLabel,
          data: trend.map(b => b.aovCzk),
          borderColor: COLOR_AOV,
          backgroundColor: COLOR_AOV_FILL,
          // Line-specific props (fill, tension, pointRadius) cast via options-compatible path
          ...({ fill: true, tension: 0.3, pointRadius: 3 } as Record<string, unknown>),
        } as ChartConfig['data']['datasets'][0],
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: Record<string, unknown>) => {
              const val = Number(ctx['raw'] ?? 0)
              return `AOV: ${formatCzk(val)}`
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: unknown) => formatCzk(Number(value)),
          },
        },
      },
    },
  }
}

// ── buildSmsCostLineConfig ────────────────────────────────────────────────────

/**
 * Builds a Line chart config for the SMS cost trend (cost in CZK per bucket).
 * CostCzk = smsCount × SmsUnitCostCzk from FleetSettings.
 *
 * @param smsCost - SMS cost per time bucket from the API.
 * @param smsLabel - Translated dataset label (e.g. "Náklady SMS").
 */
export function buildSmsCostLineConfig(smsCost: SmsCostBucketDto[], smsLabel = 'Náklady SMS (Kč)'): ChartConfig {
  return {
    type: 'line',
    data: {
      labels: smsCost.map(b => b.bucket),
      datasets: [
        {
          label: smsLabel,
          data: smsCost.map(b => b.costCzk),
          borderColor: COLOR_SMS,
          backgroundColor: COLOR_SMS_FILL,
          // Line-specific props (fill, tension, pointRadius) cast via options-compatible path
          ...({ fill: true, tension: 0.3, pointRadius: 3 } as Record<string, unknown>),
        } as ChartConfig['data']['datasets'][0],
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: Record<string, unknown>) => {
              const val = Number(ctx['raw'] ?? 0)
              return `SMS: ${formatCzk(val)}`
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: unknown) => formatCzk(Number(value)),
          },
        },
      },
    },
  }
}

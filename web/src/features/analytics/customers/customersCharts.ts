/**
 * Pure chart config builders for the Customers (Zákazníci) analytics tab.
 *
 * These functions return Chart.js ChartConfiguration objects without importing
 * react-chartjs-2, so they can be unit-tested in jsdom without a canvas.
 */

import { theme } from '../../../shared/theme/theme'
import type { NewVsReturningBucketDto, RatingBucketDto, RatingTrendBucketDto } from '../../../shared/api/client'
import type { ChartConfig } from '../demand/demandCharts'

export type { ChartConfig }

// ── Palette helpers ───────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const COLOR_NEW = hexToRgba(theme.colors.primary, 0.8)
const COLOR_RETURNING = hexToRgba(theme.colors.success, 0.8)
const COLOR_RATING = hexToRgba(theme.colors.warning, 0.85)
const COLOR_RATINGS_DIST: string[] = [
  hexToRgba(theme.colors.error, 0.8),      // 1 star
  hexToRgba(theme.colors.ratingLow, 1),    // 2 star — orange accent (opaque, unchanged hue)
  hexToRgba(theme.colors.warning, 0.85),   // 3 star
  hexToRgba(theme.colors.ratingHigh, 1),   // 4 star — lime accent (opaque, unchanged hue)
  hexToRgba(theme.colors.success, 0.85),   // 5 star
]

// ── New vs returning rides bar chart ─────────────────────────────────────────

/**
 * Builds a stacked bar chart config showing new vs returning rides per bucket.
 *
 * @param buckets - Per-bucket new vs returning ride counts.
 * @param newLabel - Optional label for the new rides series.
 * @param returningLabel - Optional label for the returning rides series.
 */
export function buildNewVsReturningBarConfig(
  buckets: NewVsReturningBucketDto[],
  newLabel = 'Noví zákazníci',
  returningLabel = 'Vracející se zákazníci',
): ChartConfig {
  return {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.bucket),
      datasets: [
        {
          label: newLabel,
          data: buckets.map(b => b.newRides),
          backgroundColor: COLOR_NEW,
          stack: 'rides',
        },
        {
          label: returningLabel,
          data: buckets.map(b => b.returningRides),
          backgroundColor: COLOR_RETURNING,
          stack: 'rides',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
  }
}

// ── Ratings distribution bar chart ───────────────────────────────────────────

/**
 * Builds a bar chart config showing count per star level (1–5).
 *
 * @param distribution - Rating bucket counts from the endpoint.
 * @param label - Optional label for the dataset.
 */
export function buildRatingsDistributionBarConfig(
  distribution: RatingBucketDto[],
  label = 'Počet hodnocení',
): ChartConfig {
  return {
    type: 'bar',
    data: {
      labels: distribution.map(d => String(d.stars)),
      datasets: [
        {
          label,
          data: distribution.map(d => d.count),
          backgroundColor: distribution.map((_, i) => COLOR_RATINGS_DIST[i] ?? COLOR_RATING),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
    },
  }
}

// ── Ratings average trend line chart ─────────────────────────────────────────

/**
 * Builds a line chart config showing average rating trend over time.
 * Null avgRating values are replaced with 0 for the dataset (chart shows the gap).
 *
 * @param trend - Per-bucket average ratings.
 * @param label - Optional label for the dataset.
 */
export function buildRatingsTrendLineConfig(
  trend: RatingTrendBucketDto[],
  label = 'Průměrné hodnocení',
): ChartConfig {
  return {
    type: 'line',
    data: {
      labels: trend.map(t => t.bucket),
      datasets: [
        {
          label,
          data: trend.map(t => t.avgRating ?? 0),
          borderColor: COLOR_RATING,
          backgroundColor: hexToRgba(theme.colors.warning, 0.12),
          borderWidth: 2,
          ...(({ tension: 0.3, pointRadius: 3 } as Record<string, unknown>)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { min: 1, max: 5 } },
    },
  }
}

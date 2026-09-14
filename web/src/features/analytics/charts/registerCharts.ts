/**
 * Registers only the Chart.js controllers, scales, and plugins that the
 * analytics feature uses (Line/area, Bar/stacked, Doughnut, horizontal Bar).
 *
 * Import this module once before rendering any <Line>, <Bar>, or <Doughnut>
 * component from react-chartjs-2. The function is idempotent — Chart.js's
 * registry deduplicates re-registration automatically.
 *
 * IMPORTANT: This module must only be imported inside the lazy analytics chunk
 * (i.e. from files under features/analytics/). Do NOT import it from eager
 * routes (/x, /d, /c) or it will bloat those bundles with ~180 KB of chart.js.
 *
 * Heatmap decision (2026-09-13): chartjs-chart-matrix is NOT installed. The
 * daily-hours heatmap tab (WI-14a) will use a Bar fallback. If a true matrix
 * plugin is needed in the future, install chartjs-chart-matrix and extend this
 * registration then.
 */

import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Legend,
  Tooltip,
  Title,
} from 'chart.js'

/** Registers Chart.js components needed by the analytics feature. Idempotent. */
export function registerCharts(): void {
  Chart.register(
    LineController,
    BarController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Filler,
    Legend,
    Tooltip,
    Title,
  )
}

// Auto-register on module load so a single `import './registerCharts'` is enough.
registerCharts()

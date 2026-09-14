/**
 * Pure SVG sparkline point-string builder for the Platform screen's 12-week
 * rides sparklines. Deliberately has NO chart.js / react-chartjs-2 imports so
 * the SuperAdmin /admin/platform screen stays out of the FleetAdmin analytics
 * chunk (a Chart.js import would force an admin→analytics chunk dependency via
 * vite manualChunks). A 12-point line is trivially an SVG <polyline>.
 */

/**
 * Builds the `points` attribute for an SVG `<polyline>` from a series of values.
 *
 * The x-axis spreads points evenly across `width`; the y-axis is inverted so the
 * maximum value sits at the top (y=0) and the minimum at the bottom (y=height).
 * When the series has no range (single point or all-equal values), points render
 * on the vertical midline.
 *
 * @param values - Series values (e.g. completed rides per ISO week, oldest first).
 * @param width - SVG viewport width in user units.
 * @param height - SVG viewport height in user units.
 * @returns A space-separated `"x,y"` point string, or `''` when `values` is empty.
 */
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return ''

  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  const midY = height / 2

  const stepX = values.length === 1 ? 0 : width / (values.length - 1)

  return values
    .map((v, i) => {
      const x = Math.round(i * stepX)
      const y = range === 0 ? midY : height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')
}

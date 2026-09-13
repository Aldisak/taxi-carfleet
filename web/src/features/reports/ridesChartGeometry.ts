/**
 * Pure geometry for the hand-rolled rides-per-day SVG bar chart (NO chart library —
 * rules/web-performance.md#bundle-budget). Maps a series of day→count values to bar
 * rectangles in an SVG viewBox. Components render; this module decides.
 */

/** One input bucket: a Prague-local day (yyyy-MM-dd) and its ride count. */
export interface RidesPerDayPoint {
  date: string
  count: number
}

/** A computed bar rectangle in SVG user units, plus its source data for labelling. */
export interface ChartBar {
  date: string
  count: number
  /** Left edge x in SVG units. */
  x: number
  /** Top edge y in SVG units (0 at the top of the viewBox). */
  y: number
  width: number
  height: number
}

/** Layout options for the chart geometry. Sensible defaults keep callers terse. */
export interface ChartLayout {
  /** Total viewBox width in SVG units. */
  width: number
  /** Total viewBox height in SVG units. */
  height: number
  /** Gap between adjacent bars in SVG units. */
  gap: number
  /** Bottom padding reserved for day labels / axis. */
  bottomPadding: number
  /** Top padding reserved above the tallest bar. */
  topPadding: number
}

export const DEFAULT_CHART_LAYOUT: ChartLayout = {
  width: 600,
  height: 200,
  gap: 4,
  bottomPadding: 24,
  topPadding: 8,
}

/**
 * Maps a day→count series to bar rectangles. Bars share the full plot width evenly;
 * heights scale to the series max (the tallest bar fills the plot area). An all-zero
 * (or empty) series yields zero-height bars — never NaN (no divide-by-zero).
 */
export function computeChartBars(
  points: readonly RidesPerDayPoint[],
  layout: ChartLayout = DEFAULT_CHART_LAYOUT,
): ChartBar[] {
  if (points.length === 0) return []

  const plotHeight = Math.max(0, layout.height - layout.bottomPadding - layout.topPadding)
  const maxCount = points.reduce((m, p) => Math.max(m, p.count), 0)
  const slot = layout.width / points.length
  const barWidth = Math.max(0, slot - layout.gap)

  return points.map((p, i) => {
    const height = maxCount === 0 ? 0 : (p.count / maxCount) * plotHeight
    const x = i * slot + layout.gap / 2
    const y = layout.topPadding + (plotHeight - height)
    return { date: p.date, count: p.count, x, y, width: barWidth, height }
  })
}

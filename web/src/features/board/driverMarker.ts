/** Color string for a driver status. */
export type MarkerColor = 'green' | 'blue' | 'orange' | 'gray'

/** Props derived from driver status and heading for rendering a map marker icon. */
export interface DriverMarkerProps {
  /** Fill color for the marker SVG. */
  color: MarkerColor
  /** Rotation in degrees. 0 when hasHeading is false. */
  rotation: number
  /** True when a heading was provided (non-null), false for the neutral no-arrow icon. */
  hasHeading: boolean
}

const STATUS_COLOR_MAP: Record<string, MarkerColor> = {
  Free: 'green',
  EnRoute: 'blue',
  Busy: 'orange',
  Offline: 'gray',
}

/**
 * Derives map marker visual properties from a driver's status and heading.
 *
 * @param status - The driver's current DriverStatus string.
 * @param heading - The driver's current heading in degrees, or null if unknown.
 * @returns Props for the marker icon: color, rotation, and heading presence flag.
 */
export function getDriverMarkerProps(status: string, heading: number | null): DriverMarkerProps {
  const color: MarkerColor = STATUS_COLOR_MAP[status] ?? 'gray'
  const hasHeading = heading !== null
  const rotation = hasHeading ? heading! : 0

  return { color, rotation, hasHeading }
}

/**
 * Maps an abstract {@link MarkerColor} to its semantic CSS custom property, so the
 * Leaflet divIcon SVG fill/stroke reads a theme token (light/dark aware) rather than a
 * hardcoded Tailwind hex (dispatcher redesign §2). Free→success, EnRoute→info, Busy→warning,
 * Offline/gray→ink-3 (the neutral ink token, matching the desk token table). Leaflet divIcons
 * are real DOM nodes, so `var(--…)` resolves in the injected SVG.
 */
const MARKER_COLOR_TOKEN: Record<MarkerColor, string> = {
  green: 'var(--success)',
  blue: 'var(--info)',
  orange: 'var(--warning)',
  gray: 'var(--ink-3)',
}

/** Returns the semantic CSS-var token string for a marker colour. */
export function getMarkerColorToken(color: MarkerColor): string {
  return MARKER_COLOR_TOKEN[color]
}

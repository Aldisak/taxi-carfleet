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

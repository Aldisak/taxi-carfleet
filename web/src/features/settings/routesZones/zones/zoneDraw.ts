import type { CreateZoneRequest, ZonePolygonPoint } from '../../../../shared/api/client'

/**
 * A drawn map point. Deliberately Leaflet-free (a plain {lat,lng}) so this module is pure
 * and unit-testable in jsdom — the Leaflet rendering lives in the lazy ZoneEditorMap
 * (rules/web-architecture.md#pure-logic-modules). The radius is computed here (haversine),
 * never via L.latLng.distanceTo, so no Leaflet dependency leaks in.
 */
export interface DrawPoint {
  lat: number
  lng: number
}

/** Earth mean radius in metres (haversine). */
const EARTH_RADIUS_M = 6_371_000

const toRad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Great-circle distance in metres between two points (haversine). Used to derive a Circle
 * zone's radius from the center + the point the user dragged to. Matches the server-side
 * ZoneService.Contains haversine so the drawn circle means the same thing server-side.
 */
export function haversineMeters(a: DrawPoint, b: DrawPoint): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Maps a drawn Circle (click center, drag to an edge) to a CreateZoneRequest. The radius is
 * the haversine distance from center to the dragged edge, rounded to whole metres. Polygon
 * fields are null (per-shape exclusivity the A4 validator enforces).
 */
export function circleToRequest(
  name: string,
  center: DrawPoint,
  edge: DrawPoint,
  isEnabled: boolean,
): CreateZoneRequest {
  return {
    name,
    shape: 'Circle',
    centerLat: center.lat,
    centerLng: center.lng,
    radiusMeters: Math.round(haversineMeters(center, edge)),
    polygon: null,
    isEnabled,
  }
}

/**
 * Maps a drawn Polygon (clicked points, closed on double-click) to a CreateZoneRequest. The
 * points become a [lat,lng] array; center/radius are null. Requires at least 3 points (a
 * ring) — the A4 validator rejects < 3 and > 200 points.
 */
export function polygonToRequest(
  name: string,
  points: DrawPoint[],
  isEnabled: boolean,
): CreateZoneRequest {
  if (points.length < 3) {
    throw new Error('A polygon zone needs at least 3 points.')
  }
  const polygon: ZonePolygonPoint[] = points.map((p) => [p.lat, p.lng])
  return {
    name,
    shape: 'Polygon',
    centerLat: null,
    centerLng: null,
    radiusMeters: null,
    polygon,
    isEnabled,
  }
}

/**
 * Appends a clicked point to the in-progress polygon ring (pure reducer). Returns a new
 * array so React state updates are immutable.
 */
export function addPolygonPoint(points: DrawPoint[], next: DrawPoint): DrawPoint[] {
  return [...points, next]
}

/** Whether an in-progress polygon ring can be closed (needs at least 3 points). */
export function canClosePolygon(points: DrawPoint[]): boolean {
  return points.length >= 3
}

import { useEffect, useRef } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import { MapyMap } from '../../../shared/map/MapyMap'
import { cameraIntent, type LatLng } from '../../../shared/map/mapCamera'

/**
 * Headless react-leaflet controller that applies a camera target imperatively (useMap()),
 * copied from CustomerMapBackground's CameraController (copied, NOT shared — it is react-leaflet
 * coupled and must live inside this lazy chunk; only the pure cameraIntent it calls is the
 * shared/map/mapCamera module). It reads the pure decision and only calls setView/fitBounds when
 * the target changes (a prev-key ref guards against reactive re-render storms). The zoom is read
 * from the live map (map.getZoom()) so the page never invents one.
 */
function CameraController({ points }: { points: LatLng[] | null }) {
  const map = useMap()
  const prevKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!points || points.length === 0) return
    const intent = cameraIntent({ points, currentZoom: map.getZoom() })
    if (!intent) return
    const key = JSON.stringify(intent)
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    if (intent.kind === 'setView') {
      map.setView([intent.center.lat, intent.center.lng], intent.zoom)
    } else {
      map.fitBounds([
        [intent.bounds.southWest.lat, intent.bounds.southWest.lng],
        [intent.bounds.northEast.lat, intent.bounds.northEast.lng],
      ])
    }
  }, [points, map])

  return null
}

// OWN/PICKUP/DROPOFF divIcons are COPIED verbatim from RideMapInner (design-review F-1): copied,
// NOT imported, so RideMapInner has zero remaining importers when WI-5 deletes it (an import would
// dangle tsc or force retaining a dead leaflet module). The classNames are preserved.
// Module-level consts so each divIcon is created once (rules/web-performance.md — no useMemo).
const OWN_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="7" fill="#1a73e8" stroke="white" stroke-width="2"/></svg>`,
  className: 'ride-own-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

const PICKUP_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
    <path d="M10 0C4.477 0 0 4.477 0 10c0 7 10 18 10 18s10-11 10-18C20 4.477 15.523 0 10 0z" fill="#188038" stroke="white" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="4" fill="white"/></svg>`,
  className: 'ride-pickup-icon',
  iconSize: [20, 28],
  iconAnchor: [10, 28],
})

const DROPOFF_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
    <path d="M10 0C4.477 0 0 4.477 0 10c0 7 10 18 10 18s10-11 10-18C20 4.477 15.523 0 10 0z" fill="#d93025" stroke="white" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="4" fill="white"/></svg>`,
  className: 'ride-dropoff-icon',
  iconSize: [20, 28],
  iconAnchor: [10, 28],
})

/** Props for the lazy driver map body. Coordinates + geometry only — never a fetch. */
export interface DriverMapInnerProps {
  /** The driver's own current position, or null before the first fix. */
  own: LatLng | null
  /** The pickup location, or null when not applicable. */
  pickup: LatLng | null
  /** The dropoff location, or null when the order has no dropoff. */
  dropoff: LatLng | null
  /** The fastest-route polyline as [lat, lng] pairs; a Polyline draws when it has >=2 points. */
  routeGeometry: number[][] | null
  /** Camera points to frame (0 → no move, 1 → setView, >=2 → fitBounds), or null. */
  cameraTarget: LatLng[] | null
  /** Accessible label for the map region; defaults to driver.map.label. */
  ariaLabel?: string
}

/**
 * The lazy react-leaflet body for the map-first /driver screen. Presentational (props only —
 * never a fetch): it renders the driver's own/pickup/dropoff markers and the fastest-route
 * Polyline (the codebase's FIRST — CustomerMapBackground draws markers only) inside the shared
 * MapyMap, plus a headless CameraController.
 *
 * This is the ONLY module under features/driver/ that imports MapyMap/react-leaflet/leaflet — it
 * is loaded via React.lazy from DriverMapScreen (WI-5), so leaflet never enters the eager /driver
 * chunk (rules/web-performance.md#code-splitting). Do NOT statically import it anywhere eager.
 */
export default function DriverMapInner({
  own,
  pickup,
  dropoff,
  routeGeometry,
  cameraTarget,
  ariaLabel,
}: DriverMapInnerProps) {
  const { t } = useTranslation()
  const hasRoute = routeGeometry != null && routeGeometry.length >= 2

  return (
    <MapyMap ariaLabel={ariaLabel ?? t('driver.map.label')}>
      <CameraController points={cameraTarget} />
      {hasRoute && <Polyline positions={routeGeometry as [number, number][]} />}
      {own && <Marker position={[own.lat, own.lng]} icon={OWN_ICON} title={t('driver.map.ownLabel')} />}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} title={t('driver.map.pickupLabel')} />
      )}
      {dropoff && (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={DROPOFF_ICON} title={t('driver.map.dropoffLabel')} />
      )}
    </MapyMap>
  )
}

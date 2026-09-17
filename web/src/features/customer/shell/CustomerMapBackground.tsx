import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { MapyMap } from '../../../shared/map/MapyMap'
import { cameraIntent, type LatLng } from './mapCamera'
import { createMoveendDebouncer } from './centerPin'

/**
 * Debounce window (ms) before a settled map center is reported through onCenterChange — avoids
 * one reverse-geocode per intermediate frame while the user drags/zooms the map. Mirrors
 * useReverseGeocode's REVERSE_DEBOUNCE_MS / useSuggest's debounce precedent.
 */
export const MOVEEND_DEBOUNCE_MS = 300

/**
 * Headless react-leaflet controller that applies a camera target imperatively (useMap()),
 * mirroring board/MapPanel's MapCenterController: it reads the pure decision from
 * mapCamera.ts and only calls setView/fitBounds when the target changes (a prev-target ref
 * guards against reactive re-render storms). The zoom is read from the live map here
 * (map.getZoom()) so the page never has to invent one. Lives INSIDE this lazy chunk so
 * react-leaflet stays out of eager bundles.
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

/**
 * Headless react-leaflet listener that reports the settled map center on `moveend`. The center
 * is debounced (createMoveendDebouncer) so a drag/zoom fires onCenterChange once movement stops
 * rather than per frame. A ref-to-latest-callback keeps onCenterChange from being captured stale
 * without re-creating the debouncer on every render. Lives inside the lazy chunk.
 *
 * It ALSO reports the settled INITIAL center once on mount (through the same debounce): react-
 * leaflet applies the initial `center` prop without firing `moveend`, so without this the map
 * would never report a pickup until the user dragged it — the customer's pickup must default to
 * the GPS/config center per UC-015 (a map-landed customer can type a destination and order
 * without touching the map). The debounce path means a subsequent user drag simply supersedes
 * this initial emit (createMoveendDebouncer cancels the pending push), so at most one of the two
 * is delivered when a drag happens before the window elapses.
 */
function MoveendController({ onCenterChange }: { onCenterChange: (coords: LatLng) => void }) {
  const callbackRef = useRef(onCenterChange)
  callbackRef.current = onCenterChange

  const debouncerRef = useRef<ReturnType<typeof createMoveendDebouncer> | null>(null)
  if (debouncerRef.current === null) {
    debouncerRef.current = createMoveendDebouncer(MOVEEND_DEBOUNCE_MS, (coords) => callbackRef.current(coords))
  }

  const map = useMapEvents({
    moveend() {
      const c = map.getCenter()
      debouncerRef.current?.push({ lat: c.lat, lng: c.lng })
    },
  })

  useEffect(() => {
    // Seed the initial center once so the pickup defaults to the map center (no drag required).
    const c = map.getCenter()
    debouncerRef.current?.push({ lat: c.lat, lng: c.lng })
    const debouncer = debouncerRef.current
    return () => debouncer?.cancel()
    // Mount-only: the map instance is stable for the controller's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

// The fixed center-pin overlay: absolutely centered over the map so the map "moves under" it;
// the settled center is what onCenterChange reports (the pickup coordinate). Non-interactive
// (pointer-events off) and marked aria-hidden — it is a visual affordance, not a control.
const CenterPin = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -100%);
  z-index: ${({ theme }) => theme.zIndex.overlay};
  width: 24px;
  height: 32px;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 20px;
    border-radius: 50% 50% 50% 0;
    transform-origin: center;
    rotate: 45deg;
    background: ${({ theme }) => theme.colors.primary};
    box-shadow: ${({ theme }) => theme.shadows.md};
  }
`

/** Props for the full-bleed customer map background. */
export interface CustomerMapBackgroundProps {
  /**
   * Camera points the shell drives (GPS center, pickup + destination). 0 → no move, 1 → setView,
   * ≥2 → fitBounds. The in-map controller reads the live map zoom for the setView clamp so the
   * page never invents a zoom. Consumers (UC-015/016) supply it.
   */
  cameraTarget?: LatLng[] | null
  /**
   * Called (debounced) with the settled map center on `moveend`. When wired, a fixed center-pin
   * overlay renders so the map "moves under" the pin and its center is the chosen pickup.
   */
  onCenterChange?: (coords: LatLng) => void
}

/**
 * The full-bleed background map for the customer map shell. This is the ONLY module under the
 * shell that imports MapyMap (and hence leaflet) — it is loaded via React.lazy from
 * CustomerMapShell so leaflet never enters the eager customer chunk
 * (rules/web-performance.md#code-splitting). MapyMap itself waits for /geo/config before it
 * mounts a MapContainer, so the map never mounts on an undefined center.
 */
export default function CustomerMapBackground({
  cameraTarget = null,
  onCenterChange,
}: CustomerMapBackgroundProps) {
  const { t } = useTranslation()

  return (
    <MapyMap ariaLabel={t('customer.shell.mapLabel')}>
      <CameraController points={cameraTarget} />
      {onCenterChange && <MoveendController onCenterChange={onCenterChange} />}
      {onCenterChange && <CenterPin data-testid="center-pin" aria-hidden="true" />}
    </MapyMap>
  )
}

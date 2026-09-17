import { useEffect, useRef, useState } from 'react'
import { Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { MapyMap } from '../../../shared/map/MapyMap'
import { cameraIntent, type LatLng } from './mapCamera'
import { createMoveendDebouncer } from './centerPin'
import { interpolateCoord, shouldAnimate } from '../tracking/markerInterpolation'

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

// Duration (ms) the car marker animates over between two discrete position fixes — roughly the
// driver-position update interval, so the marker glides continuously rather than jumping. Exported
// so the interpolation test can pick frame timestamps against it.
export const MARKER_ANIMATION_MS = 3000

// Migrated verbatim from tracking/TrackingMapInner (removed in WI-4). The '.tracking-car-icon'
// className is a load-bearing e2e contract (web/e2e/customer.spec.ts locates it) — do not rename.
// Module-level consts so each divIcon is created once (rules/web-performance.md — no useMemo needed).
const PICKUP_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.373 18.627 0 12 0z" fill="#188038" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white"/></svg>`,
  className: 'tracking-pickup-icon',
  iconSize: [24, 32],
  iconAnchor: [12, 32],
})

const CAR_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="#1a73e8" stroke="white" stroke-width="2"/>
    <path d="M8 16v-3l1.5-3.5h9L20 13v3h-2v-1.5H10V16z" fill="white"/></svg>`,
  className: 'tracking-car-icon',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

/** Reads the current prefers-reduced-motion setting (defensive against jsdom without matchMedia). */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Renders the car/driver marker and animates its rendered position frame-by-frame between discrete
 * `target` fixes via markerInterpolation (WI-1) + requestAnimationFrame. The interpolated position
 * is held in LOCAL state and never threaded back up through the shell — a 60 fps shell re-render
 * would violate rules/web-performance.md#high-frequency-events. The first fix snaps (no prev). When
 * the user prefers reduced motion the marker jumps directly to each new target (no rAF).
 */
function AnimatedCarMarker({ target, title }: { target: LatLng; title: string }) {
  const [rendered, setRendered] = useState<LatLng>(target)
  // Ref-to-latest-rendered so the animation effect reads the current position without depending
  // on it (mirrors MoveendController's ref-to-latest-callback pattern).
  const renderedRef = useRef<LatLng>(target)
  renderedRef.current = rendered

  useEffect(() => {
    const from = renderedRef.current
    // First fix / no motion → snap directly to the target.
    if (!shouldAnimate(prefersReducedMotion())) {
      setRendered(target)
      return
    }

    let rafId = 0
    let startTs: number | null = null
    const tick = (ts: number): void => {
      if (startTs === null) startTs = ts
      const elapsed = ts - startTs
      const next = interpolateCoord(from, target, elapsed, MARKER_ANIMATION_MS)
      setRendered(next)
      if (elapsed < MARKER_ANIMATION_MS) {
        rafId = requestAnimationFrame(tick)
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // Animate on each new target; `from` is captured from the ref at effect start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return <Marker position={[rendered.lat, rendered.lng]} icon={CAR_ICON} title={title} />
}

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
  /**
   * Live driver position (UC-016 tracking). Rendered as a smoothly-interpolated car marker inside
   * this lazy chunk; null → no car marker. Plain coordinates (the page never imports leaflet).
   */
  carMarker?: LatLng | null
  /** Pickup pin position (UC-016 tracking). Null → no pickup marker. */
  pickupMarker?: LatLng | null
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
  carMarker = null,
  pickupMarker = null,
}: CustomerMapBackgroundProps) {
  const { t } = useTranslation()

  return (
    <MapyMap ariaLabel={t('customer.shell.mapLabel')}>
      <CameraController points={cameraTarget} />
      {onCenterChange && <MoveendController onCenterChange={onCenterChange} />}
      {onCenterChange && <CenterPin data-testid="center-pin" aria-hidden="true" />}
      {pickupMarker && (
        <Marker
          position={[pickupMarker.lat, pickupMarker.lng]}
          icon={PICKUP_ICON}
          title={t('customer.tracking.pickupLabel')}
        />
      )}
      {carMarker && <AnimatedCarMarker target={carMarker} title={t('customer.tracking.carLabel')} />}
    </MapyMap>
  )
}

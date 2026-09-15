import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getDrivers, getOrders } from '../../shared/api/client'
import { MapyMap } from '../../shared/map/MapyMap'
import { usePositionStore } from '../../shared/realtime/usePositionStore'
import { useDriverFocusStore } from './useDriverFocusStore'
import { createMarkerThrottle } from './markerThrottle'
import { getDriverMarkerProps } from './driverMarker'
import { derivePinSet } from './mapPinSet'
import { useNewOrderHighlightStore } from './useCreateOrder'
import { useMapHighlightStore } from './useMapHighlight'
import type { MarkerColor } from './driverMarker'

// ---------------------------------------------------------------------------
// Styled wrappers
// ---------------------------------------------------------------------------

const MapWrapper = styled.div`
  width: 100%;
  height: 100%;
  position: relative;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

// ---------------------------------------------------------------------------
// Icon creation helpers
// ---------------------------------------------------------------------------

const COLOR_HEX: Record<MarkerColor, string> = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f97316',
  gray: '#9ca3af',
}

/**
 * Creates a Leaflet divIcon for a driver marker with the given color.
 * When hasHeading is true the icon includes a direction arrow rotated to `rotation` degrees.
 * When hasHeading is false a neutral circle is shown.
 */
function createDriverIcon(color: MarkerColor, rotation: number, hasHeading: boolean): L.DivIcon {
  const fill = COLOR_HEX[color]

  const svg = hasHeading
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rotation}deg)">
        <circle cx="12" cy="12" r="8" fill="${fill}" stroke="white" stroke-width="2"/>
        <polygon points="12,2 16,10 12,8 8,10" fill="white"/>
      </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="${fill}" stroke="white" stroke-width="2"/>
      </svg>`

  return L.divIcon({
    html: svg,
    className: 'driver-marker-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

const ORDER_PIN_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
    <path d="M10 0C4.477 0 0 4.477 0 10c0 7 10 18 10 18s10-11 10-18C20 4.477 15.523 0 10 0z" fill="#ef4444" stroke="white" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="4" fill="white"/>
  </svg>`,
  className: 'order-pin-icon',
  iconSize: [20, 28],
  iconAnchor: [10, 28],
  popupAnchor: [0, -28],
})

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

interface PinHighlightControllerProps {
  highlightedOrderId: string | null
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>
}

/** Opens the popup on the order pin matching highlightedOrderId (card→pin direction). */
function PinHighlightController({ highlightedOrderId, markerRefs }: PinHighlightControllerProps) {
  const prevHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!highlightedOrderId || highlightedOrderId === prevHighlightRef.current) return
    const marker = markerRefs.current.get(highlightedOrderId)
    if (marker) {
      marker.openPopup()
      prevHighlightRef.current = highlightedOrderId
    }
  }, [highlightedOrderId, markerRefs])

  return null
}

interface MapCenterControllerProps {
  focusedDriverId: string | null
}

/** Inner component that has access to the Leaflet map instance for imperative control.
 * Reads positions via getState() inside the effect to avoid a reactive subscription —
 * this prevents MapPanel re-rendering on every DriverPositionChanged event. */
function MapCenterController({ focusedDriverId }: MapCenterControllerProps) {
  const map = useMap()
  const prevDriverIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!focusedDriverId || focusedDriverId === prevDriverIdRef.current) return
    // Read positions imperatively — no reactive subscription needed here
    const pos = usePositionStore.getState().positions.get(focusedDriverId)
    if (pos) {
      map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 14))
      prevDriverIdRef.current = focusedDriverId
    }
  }, [focusedDriverId, map])

  return null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** B7: Leaflet map panel with driver markers, pickup pins, and highlight wiring. */
export function MapPanel() {
  const { t } = useTranslation()

  // Queries
  const { data: driversData } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    staleTime: 5_000,
  })

  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'list', 'map'],
    queryFn: () => getOrders({ status: ['New', 'Assigned'], pageSize: 200 }),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })

  // Throttled position map — markers render from this to avoid per-SignalR-event re-renders
  // (MapCenterController reads via getState() — no reactive subscription on positions needed)
  const [throttledPositions, setThrottledPositions] = useState(
    () => new Map(usePositionStore.getState().positions),
  )

  // Create throttle once; on flush write to local state (triggers a single re-render per window)
  const throttleRef = useRef(
    createMarkerThrottle((batch) => {
      setThrottledPositions(prev => {
        const next = new Map(prev)
        for (const [id, pos] of Object.entries(batch)) {
          next.set(id, pos)
        }
        return next
      })
    }, 1000),
  )

  // Subscribe to the position store: forward every update through the throttle
  useEffect(() => {
    // Seed initial positions on mount
    const initial = usePositionStore.getState().positions
    for (const [, pos] of initial.entries()) {
      throttleRef.current.push(pos)
    }
    // Subscribe to future updates
    const unsub = usePositionStore.subscribe((state) => {
      const latest = state.positions
      for (const [, pos] of latest.entries()) {
        throttleRef.current.push(pos)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focused driver (from driver row click in DriversColumn)
  const focusedDriverId = useDriverFocusStore(s => s.focusedDriverId)

  // New-order highlight store — reused for pin-click → card flash
  const setHighlight = useNewOrderHighlightStore(s => s.setHighlight)

  // Card→pin highlight: watch highlightedOrderId, open popup on matching pin
  const highlightedOrderId = useMapHighlightStore(s => s.highlightedOrderId)
  const pinMarkerRefs = useRef<Map<string, L.Marker>>(new Map())

  // Build driver marker list: initial positions from REST, then live from throttled store
  const driverMarkers = (driversData?.items ?? []).flatMap((driver) => {
    const livePos = throttledPositions.get(driver.driverId)
    // Use throttled live position first, fall back to lastLat/lastLng from REST
    const lat = livePos?.lat ?? driver.lastLat
    const lng = livePos?.lng ?? driver.lastLng
    if (lat == null || lng == null) return []  // no position yet — not placed

    const heading = livePos?.heading ?? null
    const { color, rotation, hasHeading } = getDriverMarkerProps(driver.status, heading)
    const icon = createDriverIcon(color, rotation, hasHeading)

    return [{
      driverId: driver.driverId,
      displayName: driver.displayName,
      lat,
      lng,
      icon,
    }]
  })

  // Build order pickup pins: New/Assigned with coords
  const pins = derivePinSet(
    (ordersData?.items ?? []).map(o => ({
      id: o.id,
      status: o.status,
      pickupLat: o.pickupLat ?? null,
      pickupLng: o.pickupLng ?? null,
      pickupAddress: o.pickupAddress,
      publicCode: o.publicCode,
    })),
  )

  return (
    <MapWrapper data-testid="map-panel">
      <MapyMap ariaLabel={t('board.columns.map')}>
        {/* MapCenterController reads positions via getState() to avoid reactive subscription */}
        <MapCenterController focusedDriverId={focusedDriverId} />

        {/* PinHighlightController opens popup on pin matching highlightedOrderId (card→pin) */}
        <PinHighlightController highlightedOrderId={highlightedOrderId} markerRefs={pinMarkerRefs} />

        {/* Driver markers render from throttled positions to batch visual updates */}
        {driverMarkers.map((dm) => (
          <Marker key={dm.driverId} position={[dm.lat, dm.lng]} icon={dm.icon}>
            <Popup>{t('map.driverPopup', { name: dm.displayName })}</Popup>
          </Marker>
        ))}

        {/* Pickup pins for New/Assigned orders */}
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={ORDER_PIN_ICON}
            ref={(m) => {
              if (m) {
                pinMarkerRefs.current.set(pin.id, m)
              } else {
                pinMarkerRefs.current.delete(pin.id)
              }
            }}
            eventHandlers={{
              click: () => setHighlight({ orderId: pin.id, createdAt: Date.now() }),
            }}
          >
            <Popup>{t('map.orderPopup', { code: pin.publicCode })}</Popup>
          </Marker>
        ))}
      </MapyMap>
    </MapWrapper>
  )
}

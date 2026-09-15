import { Marker } from 'react-leaflet'
import L from 'leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { MapyMap } from '../../../shared/map/MapyMap'
import type { LatLng } from './trackingMarker'

const MapWrapper = styled.div`
  width: 100%;
  height: 240px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

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

export interface TrackingMapInnerProps {
  /** Car/driver position (null when unknown — no car marker rendered). */
  car: LatLng | null
  /** Pickup pin position (null when unknown). */
  pickup: LatLng | null
}

/**
 * Leaflet body for the tracking map: the car marker (driver position) + the pickup pin.
 * Code-split behind TrackingMap's React.lazy so Leaflet never enters the initial customer chunk
 * (rules/web-performance.md#code-splitting). Markers are read-only (no dragging).
 */
export default function TrackingMapInner({ car, pickup }: TrackingMapInnerProps) {
  const { t } = useTranslation()
  // Center on the car, else the pickup; when neither is known yet fall back to the fleet
  // default center from /geo/config (MapyMap resolves it when center is omitted).
  const center: [number, number] | undefined = car
    ? [car.lat, car.lng]
    : pickup
      ? [pickup.lat, pickup.lng]
      : undefined

  return (
    <MapWrapper>
      <MapyMap center={center} ariaLabel={t('customer.tracking.mapLabel')}>
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} title={t('customer.tracking.pickupLabel')} />}
        {car && <Marker position={[car.lat, car.lng]} icon={CAR_ICON} title={t('customer.tracking.carLabel')} />}
      </MapyMap>
    </MapWrapper>
  )
}

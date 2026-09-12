import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { OSM_TILE_URL, OSM_ATTRIBUTION, DEFAULT_ZOOM } from '../../../shared/map/leafletSetup'
import type { LatLng } from './trackingMarker'

const MapWrapper = styled.div`
  width: 100%;
  height: 240px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

/** Prague centre — the default map centre when no coordinates are known yet. */
const PRAGUE_CENTER: [number, number] = [50.0755, 14.4378]

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
  const center: [number, number] = car ? [car.lat, car.lng] : pickup ? [pickup.lat, pickup.lng] : PRAGUE_CENTER

  return (
    <MapWrapper>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ width: '100%', height: '100%' }} aria-label={t('customer.tracking.mapLabel')}>
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={PICKUP_ICON} title={t('customer.tracking.pickupLabel')} />}
        {car && <Marker position={[car.lat, car.lng]} icon={CAR_ICON} title={t('customer.tracking.carLabel')} />}
      </MapContainer>
    </MapWrapper>
  )
}

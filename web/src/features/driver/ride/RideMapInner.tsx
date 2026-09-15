import { Marker } from 'react-leaflet'
import L from 'leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { MapyMap } from '../../../shared/map/MapyMap'

const MapWrapper = styled.div`
  width: 100%;
  height: 160px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

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

const OWN_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="7" fill="#1a73e8" stroke="white" stroke-width="2"/></svg>`,
  className: 'ride-own-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

export interface RideMapInnerProps {
  pickupLat: number
  pickupLng: number
  dropoffLat: number | null
  dropoffLng: number | null
  ownLat: number | null
  ownLng: number | null
}

/**
 * Leaflet map body for the ride strip. Code-split behind RideMapStrip's React.lazy
 * so Leaflet/react-leaflet never enter the eager /d ride chunk.
 */
export default function RideMapInner({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  ownLat,
  ownLng,
}: RideMapInnerProps) {
  const { t } = useTranslation()
  const center: [number, number] = [pickupLat, pickupLng]

  return (
    <MapWrapper>
      <MapyMap center={center} ariaLabel={t('driver.ride.map')}>
        <Marker position={[pickupLat, pickupLng]} icon={PICKUP_ICON} />
        {dropoffLat != null && dropoffLng != null && (
          <Marker position={[dropoffLat, dropoffLng]} icon={DROPOFF_ICON} />
        )}
        {ownLat != null && ownLng != null && (
          <Marker position={[ownLat, ownLng]} icon={OWN_ICON} />
        )}
      </MapyMap>
    </MapWrapper>
  )
}

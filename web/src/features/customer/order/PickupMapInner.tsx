import { useRef } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { OSM_TILE_URL, OSM_ATTRIBUTION, DEFAULT_ZOOM } from '../../../shared/map/leafletSetup'

const MapWrapper = styled.div`
  width: 100%;
  height: 220px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

const PIN_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.373 18.627 0 12 0z" fill="#188038" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="white"/></svg>`,
  className: 'pickup-pin-icon',
  iconSize: [24, 32],
  iconAnchor: [12, 32],
})

/** Prague centre — the default pin position when no coords are resolved yet. */
const PRAGUE_CENTER: [number, number] = [50.0755, 14.4378]

export interface PickupMapInnerProps {
  lat: number | null
  lng: number | null
  onPinMove: (lat: number, lng: number) => void
}

/**
 * Leaflet body for the pickup map: a single draggable pin. Dragging the pin reports the
 * new coordinates so the customer can set an exact pickup without an address (spec §3:
 * "map pin drag as a fallback"). Code-split behind PickupMap's React.lazy so Leaflet never
 * enters the home/initial chunk (slow-3G budget).
 */
export default function PickupMapInner({ lat, lng, onPinMove }: PickupMapInnerProps) {
  const { t } = useTranslation()
  const markerRef = useRef<L.Marker | null>(null)
  const position: [number, number] = lat != null && lng != null ? [lat, lng] : PRAGUE_CENTER

  return (
    <MapWrapper>
      <MapContainer
        center={position}
        zoom={DEFAULT_ZOOM}
        style={{ width: '100%', height: '100%' }}
        aria-label={t('customer.custom.mapLabel')}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        <Marker
          position={position}
          icon={PIN_ICON}
          draggable
          ref={markerRef}
          eventHandlers={{
            dragend: () => {
              const m = markerRef.current
              if (!m) return
              const next = m.getLatLng()
              onPinMove(next.lat, next.lng)
            },
          }}
        />
      </MapContainer>
    </MapWrapper>
  )
}

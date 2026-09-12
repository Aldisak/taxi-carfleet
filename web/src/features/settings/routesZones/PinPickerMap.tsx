import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import styled from 'styled-components'
import { OSM_TILE_URL, OSM_ATTRIBUTION, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../../shared/map/leafletSetup'

const MapWrapper = styled.div`
  width: 100%;
  height: 280px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

/** A picked coordinate. */
export interface PinPoint {
  lat: number
  lng: number
}

/** Props for PinPickerMap. */
export interface PinPickerMapProps {
  /** The current pin, or null when nothing is placed yet. */
  value: PinPoint | null
  /** Reports a new pin when the user clicks the map. */
  onPick: (point: PinPoint) => void
}

/** Captures a map click and reports it as the picked coordinate. */
function ClickCapture({ onPick }: Pick<PinPickerMapProps, 'onPick'>) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/**
 * A single-pin Leaflet map for picking a coordinate (PointToPoint route endpoints, a quick
 * place). Code-split behind React.lazy in its callers so Leaflet never enters the /x initial
 * chunk (rules/web-performance.md#code-splitting). The pure coordinate handling lives in the
 * caller's form module; this component only renders the map + a draggable pin.
 */
export default function PinPickerMap({ value, onPick }: PinPickerMapProps) {
  return (
    <MapWrapper>
      <MapContainer
        center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            draggable
            eventHandlers={{
              dragend(e) {
                const { lat, lng } = e.target.getLatLng()
                onPick({ lat, lng })
              },
            }}
          />
        )}
        <ClickCapture onPick={onPick} />
      </MapContainer>
    </MapWrapper>
  )
}

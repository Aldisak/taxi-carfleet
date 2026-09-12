import { useState } from 'react'
import { MapContainer, TileLayer, Circle, Polygon, Polyline, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet'
import styled from 'styled-components'
import { OSM_TILE_URL, OSM_ATTRIBUTION, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../../../shared/map/leafletSetup'
import type { ZoneDto } from '../../../../shared/api/client'
import { canClosePolygon, haversineMeters, type DrawPoint } from './zoneDraw'

const MapWrapper = styled.div`
  width: 100%;
  height: 360px;

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

/** The draw mode the editor is currently capturing. */
export type DrawMode = 'circle' | 'polygon'

/** A completed circle draw: a center + the radius (metres). */
export interface CircleDraft {
  center: DrawPoint
  radiusMeters: number
}

/** Props for ZoneEditorMap. */
export interface ZoneEditorMapProps {
  /** Existing zones, rendered (labelled) so the editor shows the whole fleet at once. */
  zones: ZoneDto[]
  /** The active draw mode. */
  mode: DrawMode
  /** Reports a completed circle (center click → edge click). */
  onCircleDrawn: (draft: CircleDraft) => void
  /** Reports a completed polygon (double-click closes the ring). */
  onPolygonDrawn: (points: DrawPoint[]) => void
}

/** Captures map clicks to build the in-progress draw. */
function DrawLayer({ mode, onCircleDrawn, onPolygonDrawn }: Omit<ZoneEditorMapProps, 'zones'>) {
  const [circleCenter, setCircleCenter] = useState<DrawPoint | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<DrawPoint[]>([])

  useMapEvents({
    click(e) {
      const point: DrawPoint = { lat: e.latlng.lat, lng: e.latlng.lng }
      if (mode === 'circle') {
        if (circleCenter === null) {
          setCircleCenter(point)
        } else {
          onCircleDrawn({ center: circleCenter, radiusMeters: Math.round(haversineMeters(circleCenter, point)) })
          setCircleCenter(null)
        }
      } else {
        setPolygonPoints((prev) => [...prev, point])
      }
    },
    dblclick() {
      if (mode === 'polygon' && canClosePolygon(polygonPoints)) {
        onPolygonDrawn(polygonPoints)
        setPolygonPoints([])
      }
    },
  })

  return (
    <>
      {circleCenter && (
        <CircleMarker center={[circleCenter.lat, circleCenter.lng]} radius={6} pathOptions={{ color: '#1a73e8' }} />
      )}
      {polygonPoints.length > 0 && (
        <Polyline positions={polygonPoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#1a73e8', dashArray: '4' }} />
      )}
    </>
  )
}

/**
 * Leaflet body for the zone editor (code-split behind ZonesTab's React.lazy so Leaflet never
 * enters the /x initial chunk — rules/web-performance.md#code-splitting). Renders every
 * existing zone (Circle or Polygon) with a name label and captures draw interactions: in
 * circle mode the first click sets the center and the second sets the radius; in polygon mode
 * each click adds a vertex and a double-click closes the ring. The pure geometry (radius,
 * point list) lives in zoneDraw.ts.
 */
export default function ZoneEditorMap({ zones, mode, onCircleDrawn, onPolygonDrawn }: ZoneEditorMapProps) {
  return (
    <MapWrapper>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        doubleClickZoom={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

        {zones.map((z) =>
          z.shape === 'Circle' && z.centerLat != null && z.centerLng != null && z.radiusMeters != null ? (
            <Circle
              key={z.id}
              center={[z.centerLat, z.centerLng]}
              radius={z.radiusMeters}
              pathOptions={{ color: z.isEnabled ? '#188038' : '#9aa0a6' }}
            >
              <Tooltip permanent>{z.name}</Tooltip>
            </Circle>
          ) : z.shape === 'Polygon' && z.polygon != null && z.polygon.length >= 3 ? (
            <Polygon
              key={z.id}
              positions={z.polygon}
              pathOptions={{ color: z.isEnabled ? '#188038' : '#9aa0a6' }}
            >
              <Tooltip permanent>{z.name}</Tooltip>
            </Polygon>
          ) : null,
        )}

        <DrawLayer mode={mode} onCircleDrawn={onCircleDrawn} onPolygonDrawn={onPolygonDrawn} />
      </MapContainer>
    </MapWrapper>
  )
}

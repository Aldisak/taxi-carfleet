import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { MapyMap } from '../../../shared/map/MapyMap'
import { cameraIntent, type CameraInput } from './mapCamera'

/**
 * Headless react-leaflet controller that applies a camera target imperatively (useMap()),
 * mirroring board/MapPanel's MapCenterController: it reads the pure decision from
 * mapCamera.ts and only calls setView/fitBounds when the target changes (a prev-target ref
 * guards against reactive re-render storms). Lives INSIDE this lazy chunk so react-leaflet
 * stays out of eager bundles.
 */
function CameraController({ target }: { target: CameraInput | null }) {
  const map = useMap()
  const prevKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!target) return
    const intent = cameraIntent(target)
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
  }, [target, map])

  return null
}

/** Props for the full-bleed customer map background. */
export interface CustomerMapBackgroundProps {
  /**
   * Optional camera target the shell drives (GPS center, route bounds…). When present the
   * headless controller moves the map imperatively. Consumers (UC-015/016) supply it.
   */
  cameraTarget?: CameraInput | null
}

/**
 * The full-bleed background map for the customer map shell. This is the ONLY module under the
 * shell that imports MapyMap (and hence leaflet) — it is loaded via React.lazy from
 * CustomerMapShell so leaflet never enters the eager customer chunk
 * (rules/web-performance.md#code-splitting). MapyMap itself waits for /geo/config before it
 * mounts a MapContainer, so the map never mounts on an undefined center.
 */
export default function CustomerMapBackground({ cameraTarget = null }: CustomerMapBackgroundProps) {
  const { t } = useTranslation()

  return (
    <MapyMap ariaLabel={t('customer.shell.mapLabel')}>
      <CameraController target={cameraTarget} />
    </MapyMap>
  )
}

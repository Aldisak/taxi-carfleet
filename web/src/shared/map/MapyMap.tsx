import { useState, type ReactNode } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import './leafletSetup'
import { useGeoConfig } from './useGeoConfig'
import { buildTileUrl, resolveTilePixelRatio } from './tileTemplate'
import { MapUnavailableBanner } from './MapUnavailableBanner'

/** Public link + logo target required by the Mapy.com attribution terms. */
const MAPY_HOME_URL = 'https://mapy.com'
/** Mapy.com logo asset served from Mapy's CDN (rendered in the map corner per spec §4). */
const MAPY_LOGO_URL = 'https://api.mapy.cz/img/api/logo.svg'

/**
 * Fallback map center (Prague centre) used ONLY when /geo/config errored AND the caller supplied
 * no explicit center — so the degraded map still mounts with SOME center rather than a blank
 * screen (rules/web-realtime.md#last-known-state). Markers place by their own coordinates
 * regardless; this only frames the initial viewport.
 */
const FALLBACK_CENTER: [number, number] = [50.0755, 14.4378]
/** Fallback zoom paired with FALLBACK_CENTER for the degraded (no-config) map. */
const FALLBACK_ZOOM = 12

const MapShell = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  background: ${({ theme }) => theme.colors.surface};
`

// Mapy logo overlay in the bottom-left map corner (the mandatory attribution logo, spec §4).
// A plain anchor (not a Leaflet control) so it is keyboard-reachable and axe-testable.
const LogoLink = styled.a`
  position: absolute;
  bottom: ${({ theme }) => theme.spacing.xs};
  left: ${({ theme }) => theme.spacing.xs};
  z-index: 1000;
  display: block;
  line-height: 0;

  img {
    height: 18px;
    width: auto;
    display: block;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

/** Props for the shared MapyMap. All react-leaflet MapContainer props pass through via rest. */
export interface MapyMapProps {
  /** Explicit map center; falls back to the fleet default from /geo/config when omitted. */
  center?: [number, number]
  /** Explicit zoom; falls back to the fleet default from /geo/config when omitted. */
  zoom?: number
  /** Accessible label for the map region. */
  ariaLabel?: string
  /** Leaflet layers/controllers (Markers, useMap controllers, useMapEvents capturers). */
  children?: ReactNode
  /** Disable double-click zoom (used by the zone editor's polygon-close). */
  doubleClickZoom?: boolean
}

/**
 * The single shared map wrapper for all three role apps (dispatcher / driver / customer).
 * Wraps a Leaflet MapContainer + a Mapy.com TileLayer (built from the per-fleet /geo/config:
 * tile template + browser key + @2x retina) + the mandatory Mapy attribution (attribution
 * control text + corner logo link). Center/zoom default to the fleet's configured values.
 *
 * MapContainer reads center/zoom only at mount. Three states (rules/web-realtime.md#last-known-state):
 * - loading (config still fetching, no error) → a loading placeholder.
 * - config error → the map STILL mounts (grey, no TileLayer) so markers place by coordinate,
 *   with a "Mapa dočasně nedostupná" banner overlaid (UC-010 AC#5). Uses the caller center or a
 *   Prague fallback.
 * - config present but the tiles fail to load → tiles are dropped and the same banner appears.
 *
 * Leaflet stays out of eager chunks: MapyMap is only ever imported inside the lazy *Inner map
 * components (rules/web-performance.md#code-splitting).
 */
export function MapyMap({ center, zoom, ariaLabel, children, ...rest }: MapyMapProps) {
  const { t } = useTranslation()
  const { data: config, isError } = useGeoConfig()
  // Flipped when the TileLayer reports a tile fetch failure (config loaded but tiles are down).
  const [tilesFailed, setTilesFailed] = useState(false)

  // MapContainer is mount-time only for center/zoom.
  const resolvedCenter = center ?? (config ? [config.mapCenterLat, config.mapCenterLng] as [number, number] : undefined)
  const resolvedZoom = zoom ?? config?.mapZoom

  // Config errored: degrade — mount the map (grey, no tiles) so markers still render by coordinate.
  if (isError && !config) {
    return (
      <MapShell>
        <MapContainer
          center={center ?? FALLBACK_CENTER}
          zoom={zoom ?? FALLBACK_ZOOM}
          style={{ width: '100%', height: '100%' }}
          aria-label={ariaLabel}
          {...rest}
        >
          {children}
        </MapContainer>
        <MapUnavailableBanner />
      </MapShell>
    )
  }

  // Still loading (no config yet, no error, and no caller-supplied viewport to mount with).
  if (!config || resolvedCenter === undefined || resolvedZoom === undefined) {
    return (
      <MapShell>
        <LoadingState role="status">{t('map.loading')}</LoadingState>
      </MapShell>
    )
  }

  const tileUrl = buildTileUrl(config.tileUrlTemplate, config.browserKey, resolveTilePixelRatio(window.devicePixelRatio ?? 1))

  return (
    <MapShell>
      <MapContainer
        center={resolvedCenter}
        zoom={resolvedZoom}
        style={{ width: '100%', height: '100%' }}
        aria-label={ariaLabel}
        {...rest}
      >
        {!tilesFailed && (
          <TileLayer
            url={tileUrl}
            attribution={config.attributionHtml}
            eventHandlers={{ tileerror: () => setTilesFailed(true) }}
          />
        )}
        {children}
      </MapContainer>
      {tilesFailed ? (
        <MapUnavailableBanner />
      ) : (
        <LogoLink href={MAPY_HOME_URL} target="_blank" rel="noopener noreferrer" title={t('map.attributionLabel')}>
          <img src={MAPY_LOGO_URL} alt={t('map.mapyLogoAlt')} />
        </LogoLink>
      )}
    </MapShell>
  )
}

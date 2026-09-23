import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import styled, { ThemeProvider } from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../../../shared/api/refresh'
import { CallButton } from './CallButton'
import { LanguageSelector } from '../../../shared/i18n/LanguageSelector'
import { useFleetBranding } from './useFleetBranding'
import { ensureFleetSlug } from './ensureFleetSlug'
import { useThemeMode } from '../../../shared/theme/useThemeMode'
import { accentCssVars } from '../../../shared/theme/accent'
import type { LatLng } from './mapCamera'

/**
 * SIBLING of CustomerLayout — never nest; both run ensureFleetSlug/enableSilentRefresh once
 * and nesting double-invokes them.
 *
 * CustomerMapShell is the new map-first customer surface (UC-014): a full-viewport (100dvh)
 * Mapy map as the background layer with absolutely-positioned overlay slots on top. It is an
 * OPT-IN surface that re-implements CustomerLayout's one-shot initializers itself
 * (ensureFleetSlug in a useState initializer, branded ThemeProvider via useFleetBranding,
 * enableSilentRefresh('/customer/login') + scheduleProactiveRefresh on mount, and
 * LanguageSelector + CallButton in the top overlay chrome). Because it re-runs those
 * initializers, nesting it under CustomerLayout (in UC-015) would DOUBLE-run them.
 *
 * No router entry is added in this UC (UC-015 wires it), so the existing /customer routes
 * keep rendering CustomerLayout unchanged — there is no live double-init risk here; this
 * comment + the exactly-once tests guard the UC-015 wiring.
 *
 * The map itself is a React.lazy chunk (CustomerMapBackground) — the ONLY importer of
 * MapyMap/leaflet under the shell — so leaflet stays out of eager bundles
 * (rules/web-performance.md#code-splitting).
 */

// Loaded lazily so leaflet (imported transitively via MapyMap) never enters the eager chunk.
const CustomerMapBackground = lazy(() => import('./CustomerMapBackground'))

const Shell = styled.div`
  position: fixed;
  inset: 0;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font);
`

// The map fills the whole viewport as the background stacking layer.
const MapLayer = styled.div`
  position: absolute;
  inset: 0;
  z-index: ${({ theme }) => theme.zIndex.map};

  .leaflet-container {
    width: 100%;
    height: 100%;
  }
`

// Top overlay slot: app chrome (language + call) plus a consumer-supplied search surface.
// safe-area padding keeps it clear of the notch / status bar.
const TopSlot = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-top))
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-right))
    ${({ theme }) => theme.spacing.md}
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-left));
  pointer-events: none;

  /* Re-enable pointer events on the actual controls (the slot itself is click-through). */
  > * {
    pointer-events: auto;
  }
`

const Chrome = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
`

// The fleet name is the customer app's brand identity in the map-first shell (it replaces the
// deleted CustomerHomePage <h1>). Rendered on a translucent surface pill so it stays legible over
// the map. Truncates rather than wrapping so it never pushes the chrome controls off-screen.
const FleetName = styled.h1`
  margin: 0;
  min-width: 0;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const ChromeControls = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

// Bottom overlay slot: the live-ride / order sheet host (empty here, filled by UC-015/016).
// It spans the width but leaves the bottom-left Mapy logo reachable (the logo sits at
// z-index attribution=1000 inside the map's own stacking context; this slot sits at
// overlay=100 and is padded off the corner).
const BottomSlot = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  padding: 0
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-right))
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-bottom))
    calc(${({ theme }) => theme.spacing.md} + env(safe-area-inset-left));
  pointer-events: none;

  > * {
    pointer-events: auto;
  }
`

/** Props for CustomerMapShell — consumers (UC-015/016) compose into the overlay slots. */
export interface CustomerMapShellProps {
  /** Content for the top overlay slot (search), rendered below the app chrome. */
  topSlot?: ReactNode
  /** Content for the bottom overlay slot (order / live-ride sheet). */
  bottomSlot?: ReactNode
  /**
   * Camera points the map background should frame (0 → no move, 1 → setView, ≥2 → fitBounds).
   * Threaded straight to CustomerMapBackground; the in-map controller reads the live zoom.
   */
  cameraTarget?: LatLng[] | null
  /** Called (debounced) with the settled map center on moveend — drives the pickup center-pin. */
  onCenterChange?: (coords: LatLng) => void
  /**
   * Live driver position (UC-016 tracking). Threaded straight to the lazy map background, which
   * renders a smoothly-interpolated car marker; null → no car marker. Plain coordinates only.
   */
  carMarker?: LatLng | null
  /** Pickup pin position (UC-016 tracking). Null → no pickup marker. */
  pickupMarker?: LatLng | null
  /**
   * The fastest pickup → destination route polyline as [lat, lng] pairs (route-preview-gps).
   * Threaded straight to the lazy map background, which draws a Polyline when it has >=2 points.
   */
  routeGeometry?: number[][] | null
}

/** The full-bleed map-first customer shell. See the file-level doc comment (SIBLING, not nested). */
export function CustomerMapShell({
  topSlot,
  bottomSlot,
  cameraTarget,
  onCenterChange,
  carMarker,
  pickupMarker,
  routeGeometry,
}: CustomerMapShellProps) {
  const { t } = useTranslation()

  // Persist the resolved slug synchronously, before useFleetBranding's query fetches
  // (a useState initializer runs during render, ahead of any child's fetch effect).
  useState(ensureFleetSlug)

  const { theme: brandedTheme, fleet } = useFleetBranding()
  // Apply the customer theme mode (system default + Menu override) to the document root, and
  // expose the tenant accent as CSS vars on this surface so the kit + map markers pick it up.
  const { resolved } = useThemeMode()
  const brandVars = accentCssVars(fleet?.primaryColorHex, resolved === 'dark')

  useEffect(() => {
    enableSilentRefresh('/customer/login')
    const token = authStorage.getAccessToken()
    if (token) {
      scheduleProactiveRefresh(token)
    }
    // Run once on mount — module state resets on every page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ThemeProvider theme={brandedTheme}>
      <Shell style={brandVars}>
        <MapLayer>
          <Suspense fallback={null}>
            <CustomerMapBackground
              cameraTarget={cameraTarget}
              onCenterChange={onCenterChange}
              carMarker={carMarker}
              pickupMarker={pickupMarker}
              routeGeometry={routeGeometry}
            />
          </Suspense>
        </MapLayer>

        <TopSlot role="region" aria-label={t('customer.shell.topSlotLabel')}>
          <Chrome aria-label={t('customer.shell.chromeLabel')} role="group">
            {fleet?.name && <FleetName>{fleet.name}</FleetName>}
            <ChromeControls>
              <LanguageSelector />
              <CallButton phone={fleet?.phone} />
            </ChromeControls>
          </Chrome>
          {topSlot}
        </TopSlot>

        <BottomSlot role="region" aria-label={t('customer.shell.bottomSlotLabel')}>
          {bottomSlot}
        </BottomSlot>
      </Shell>
    </ThemeProvider>
  )
}

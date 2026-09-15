import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

// Overlaid at the top of the map region (the parent MapShell is position:relative). Sits above
// the Leaflet panes (z-index 1000+) so it stays visible over the grey no-tile background while
// markers still render underneath by coordinate (rules/web-realtime.md#last-known-state).
const Banner = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.spacing.xs};
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  max-width: calc(100% - ${({ theme }) => theme.spacing.md});
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  text-align: center;
`

/**
 * Banner shown when the Mapy tile configuration (/geo/config) fails to load or the tiles
 * themselves cannot be fetched (UC-010 AC#5). Renders "Mapa dočasně nedostupná" as a
 * role="alert" (aria-live="polite") overlay so screen readers announce the degradation. The
 * map still renders the grey background with markers placed by coordinate underneath — never a
 * blank screen (rules/web-realtime.md#last-known-state).
 */
export function MapUnavailableBanner() {
  const { t } = useTranslation()
  return (
    <Banner role="alert" aria-live="polite" data-testid="map-unavailable-banner">
      {t('map.unavailable')}
    </Banner>
  )
}

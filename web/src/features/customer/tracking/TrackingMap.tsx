import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { TrackingMapInnerProps } from './TrackingMapInner'

// Code-split: Leaflet + react-leaflet load only when the map is first expanded, so they never
// enter the initial customer chunk (rules/web-performance.md#code-splitting; the tracking screen
// must render the headline immediately without waiting for the map, mirroring PickupMap/RideMapStrip).
const TrackingMapInner = lazy(() => import('./TrackingMapInner'))

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
  margin: 0 ${({ theme }) => theme.spacing.md};
`

const ToggleButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: none;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
  text-align: center;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -3px;
  }
`

type TrackingMapProps = TrackingMapInnerProps

/**
 * Collapsible tracking map (car marker + pickup pin). Collapsed by default; the Leaflet body is
 * code-split behind React.lazy so the initial tracking chunk stays free of Leaflet (slow-3G budget).
 */
export function TrackingMap(props: TrackingMapProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <Wrapper aria-label={t('customer.tracking.mapLabel')}>
      <ToggleButton type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? t('customer.tracking.hideMap') : t('customer.tracking.showMap')}
      </ToggleButton>
      {expanded && (
        <Suspense fallback={null}>
          <TrackingMapInner {...props} />
        </Suspense>
      )}
    </Wrapper>
  )
}

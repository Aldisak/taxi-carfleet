import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { RideMapInnerProps } from './RideMapInner'

// Code-split: Leaflet + react-leaflet load only when the strip is first expanded,
// so they never enter the eager /d ride chunk (rules/web-performance.md#code-splitting).
const RideMapInner = lazy(() => import('./RideMapInner'))

const Strip = styled.section`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.surface};
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
`

type RideMapStripProps = RideMapInnerProps

/** Collapsible Leaflet map strip: own position + pickup/dropoff pins. Collapsed by default. */
export function RideMapStrip(props: RideMapStripProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <Strip aria-label={t('driver.ride.map')}>
      <ToggleButton
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? t('driver.ride.mapHide') : t('driver.ride.mapShow')}
      </ToggleButton>
      {expanded && (
        <Suspense fallback={null}>
          <RideMapInner {...props} />
        </Suspense>
      )}
    </Strip>
  )
}

import { lazy, Suspense, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { PickupMapInnerProps } from './PickupMapInner'

// Code-split: Leaflet + react-leaflet load only when the map is first expanded, so they
// never enter the customer home/initial chunk (rules/web-performance.md#code-splitting,
// spec §Behavior rules: the home screen must not wait for Leaflet on slow 3G).
const PickupMapInner = lazy(() => import('./PickupMapInner'))

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
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

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -3px;
  }
`

const Hint = styled.p`
  margin: 0;
  padding: 0 ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

type PickupMapProps = PickupMapInnerProps

/**
 * Collapsible pickup map with a draggable pin (fallback when autocomplete/GPS don't resolve
 * a precise spot). Collapsed by default; the Leaflet body is code-split behind React.lazy.
 */
export function PickupMap(props: PickupMapProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <Wrapper aria-label={t('customer.custom.mapLabel')}>
      <ToggleButton type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {expanded ? t('customer.custom.hideMap') : t('customer.custom.showMap')}
      </ToggleButton>
      {expanded && (
        <>
          <Hint>{t('customer.custom.dragHint')}</Hint>
          <Suspense fallback={null}>
            <PickupMapInner {...props} />
          </Suspense>
        </>
      )}
    </Wrapper>
  )
}

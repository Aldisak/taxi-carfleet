import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { OrderForm } from './OrderForm'
import { OrdersColumn } from './OrdersColumn'
import { DriversColumn } from './DriversColumn'
import { MapPanel } from './MapPanel'

// ---------------------------------------------------------------------------
// Three-column board layout
// Desktop-first: left 360px, middle flex, right 320px
// Minimum width 1280px — no horizontal scroll at 1280×720 (AC#6)
//
// Wide (≥1600px): map becomes a fourth panel (CSS grid media query)
// Normal (<1600px): map toggle replaces the middle column
// ---------------------------------------------------------------------------

const BoardShell = styled.div<{ $showMap: boolean; $wideMap: boolean }>`
  display: grid;
  /* Normal: left | [orders OR map] | drivers */
  grid-template-columns: 360px 1fr 320px;
  grid-template-rows: 1fr;
  height: 100%;
  min-width: ${({ theme }) => theme.breakpoints.desktop};
  overflow: hidden;
  background: var(--bg);

  /* Wide (≥1600px): always show four columns when map is toggled */
  @media (min-width: 1600px) {
    grid-template-columns: ${({ $showMap }) =>
      $showMap ? '360px 1fr 400px 320px' : '360px 1fr 320px'};
  }
`

const LeftColumn = styled.aside`
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
`

const ColumnHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid var(--line);
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
`

const MiddleColumn = styled.main<{ $hidden?: boolean }>`
  height: 100%;
  overflow-y: auto;
  background: var(--bg);
  display: ${({ $hidden }) => ($hidden ? 'none' : 'flex')};
  flex-direction: column;

  /* On wide screens the orders column is always visible alongside the map */
  @media (min-width: 1600px) {
    display: flex;
  }
`

const MapColumn = styled.div<{ $visible: boolean }>`
  height: 100%;
  overflow: hidden;
  display: ${({ $visible }) => ($visible ? 'flex' : 'none')};
  flex-direction: column;
  border-left: 1px solid var(--line);

  /* On wide screens, always visible when toggled */
  @media (min-width: 1600px) {
    display: ${({ $visible }) => ($visible ? 'flex' : 'none')};
  }
`

const RightColumn = styled.aside`
  height: 100%;
  overflow-y: auto;
  border-left: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  flex-direction: column;
`

const MiddleColumnHeader = styled(ColumnHeader)`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const MapToggleButton = styled.button`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 2px ${({ theme }) => theme.spacing.xs};
  border: 1px solid var(--line);
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;

  &:hover {
    background: var(--bg);
  }
`

/** The main dispatcher board — three-column layout, desktop-first (≥1280px). */
export function BoardPage() {
  const { t } = useTranslation()
  const [showMap, setShowMap] = useState(false)

  // On wide screens (≥1600px) the map is a 4th panel — orders column always visible.
  // Below 1600px the map replaces the orders column.
  // We rely on CSS media queries in styled-components for the layout;
  // in JS we just track if the map is toggled.

  return (
    <BoardShell $showMap={showMap} $wideMap={false}>
      {/* Left column — New order form (OrderForm renders its own Panel header) */}
      <LeftColumn>
        <OrderForm />
      </LeftColumn>

      {/* Middle column — Active orders (hidden when map is showing below 1600px) */}
      <MiddleColumn $hidden={showMap}>
        <MiddleColumnHeader>
          {t('board.columns.orders')}
          <MapToggleButton
            type="button"
            aria-label={showMap ? t('map.toggleHide') : t('map.toggleShow')}
            aria-pressed={showMap}
            onClick={() => setShowMap(v => !v)}
          >
            {showMap ? t('map.toggleHide') : t('map.toggleShow')}
          </MapToggleButton>
        </MiddleColumnHeader>
        <OrdersColumn />
      </MiddleColumn>

      {/* Map column — replaces orders below 1600px, or is 4th panel above */}
      <MapColumn $visible={showMap}>
        <ColumnHeader>
          {t('board.columns.map')}
        </ColumnHeader>
        {showMap && <MapPanel />}
      </MapColumn>

      {/* Right column — Drivers */}
      <RightColumn>
        <ColumnHeader>{t('board.columns.drivers')}</ColumnHeader>
        <DriversColumn />
      </RightColumn>

      {/* Nested route outlet — renders the order drawer (B8) over the board */}
      <Outlet />
    </BoardShell>
  )
}

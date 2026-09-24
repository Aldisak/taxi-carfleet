import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getDrivers, getOrders } from '../../shared/api/client'
import { sortDriversForColumn } from './driverColumnSort'
import { DriverRow } from './DriverRow'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Column = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`

const Header = styled.header`
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
`

const HeaderTitle = styled.h2`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
`

const OnlineSummary = styled.span`
  margin-left: auto;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const ColumnContent = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`

const Footer = styled.p`
  margin: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-3);
`

const LoadingMsg = styled.div`
  padding: 16px;
  font-size: var(--fs-label);
  color: var(--ink-2);
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Active statuses that mean a driver is currently on an order. */
const ACTIVE_STATUSES = new Set(['Assigned', 'Accepted', 'Arrived', 'InProgress'])

/**
 * Right column: one row per driver, sorted Free/EnRoute+Busy/Offline, alpha within groups.
 * Builds a driverId→publicCode map from the orders cache so each row can show the current order.
 */
export function DriversColumn() {
  const { t } = useTranslation()
  const { data: driversData, isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  // Read orders from cache — uses a broad prefix query so any cached orders list is used
  // This avoids issuing a redundant fetch since OrdersColumn already polls with a similar key
  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'list', 'drivers-column'],
    queryFn: () => getOrders({ status: ['Assigned', 'Accepted', 'Arrived', 'InProgress'], pageSize: 200 }),
    staleTime: 10_000,
    refetchInterval: 30_000,  // less frequent — we only need the driverId→code mapping
  })

  if (isLoading || !driversData) {
    return <LoadingMsg>{t('board.driverPicker.loading')}</LoadingMsg>
  }

  // Build driverId → publicCode map for active orders
  const activeOrderCodeByDriver = new Map<string, string>()
  if (ordersData) {
    for (const order of ordersData.items) {
      if (order.driverId && ACTIVE_STATUSES.has(order.status)) {
        activeOrderCodeByDriver.set(order.driverId, order.publicCode)
      }
    }
  }

  const sorted = sortDriversForColumn(driversData.items)
  const total = driversData.items.length
  const online = driversData.items.filter(d => d.status !== 'Offline').length

  return (
    <Column>
      <Header>
        <HeaderTitle>{t('board.columns.drivers')}</HeaderTitle>
        <OnlineSummary>{t('drivers.onlineSummary', { online, total })}</OnlineSummary>
      </Header>
      <ColumnContent>
        {sorted.map((driver) => (
          <DriverRow
            key={driver.driverId}
            driver={driver}
            currentOrderCode={activeOrderCodeByDriver.get(driver.driverId) ?? null}
          />
        ))}
      </ColumnContent>
      <Footer>{t('drivers.mapHint')}</Footer>
    </Column>
  )
}

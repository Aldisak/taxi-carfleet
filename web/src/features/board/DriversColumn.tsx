import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getDrivers, getOrders } from '../../shared/api/client'
import { sortDriversForColumn } from './driverColumnSort'
import { DriverRow } from './DriverRow'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const ColumnContent = styled.div`
  flex: 1;
  overflow-y: auto;
`

const LoadingMsg = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
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

  return (
    <ColumnContent>
      {sorted.map((driver) => (
        <DriverRow
          key={driver.driverId}
          driver={driver}
          currentOrderCode={activeOrderCodeByDriver.get(driver.driverId) ?? null}
        />
      ))}
    </ColumnContent>
  )
}

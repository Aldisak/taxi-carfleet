import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { useOrderSearch } from './useOrderSearch'
import { SearchFilters } from './SearchFilters'
import { exportOrdersToCsv, getCsvFilename, downloadCsv } from './csvExport'
import { getDrivers } from '../../shared/api/client'
import type { OrderSummaryDto } from '../../shared/api/client'
import type { OrderFilterState } from './orderFilters'
import type { CsvOrderRow } from './csvExport'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
`

const Tr = styled.tr`
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }

  &:not(:last-child) td {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
`

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
`

const StatusPill = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'New': return theme.colors.orderNew + '33'
      case 'Assigned': return theme.colors.orderAssigned + '33'
      case 'Accepted': return theme.colors.orderAssigned + '33'
      case 'Arrived': return theme.colors.orderAssigned + '33'
      case 'InProgress': return theme.colors.orderInProgress + '33'
      case 'Completed': return theme.colors.orderCompleted + '33'
      case 'Cancelled': return theme.colors.orderCancelled + '33'
      default: return theme.colors.border
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'New': return theme.colors.orderNew
      case 'InProgress': return theme.colors.orderInProgress
      case 'Completed': return theme.colors.orderCompleted
      case 'Cancelled': return theme.colors.orderCancelled
      default: return theme.colors.primary
    }
  }};
`

const Pagination = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const PaginationButton = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

const EmptyMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`

function formatWhen(order: OrderSummaryDto, t: (key: string) => string): string {
  if (!order.scheduledAt) return t('search.table.asap')
  return new Date(order.scheduledAt).toLocaleString('cs-CZ', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrice(order: OrderSummaryDto): string {
  const price = order.fixedPriceCzk ?? order.estimatedPriceCzk
  if (price == null) return '—'
  const prefix = order.priceType === 'Fixed' ? '' : '~'
  return `${prefix}${price} Kč`
}

/** The search/history page at /dispatcher/orders. */
export function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [filters, setFilters] = useState<OrderFilterState>({
    page: 1,
    pageSize: 50,
  })

  const { data, isLoading } = useOrderSearch(filters)

  // Load drivers for name lookup in CSV export
  const { data: driversData } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    staleTime: 60_000,
  })

  const driverNameMap = useMemo(
    () => new Map(driversData?.items.map((d) => [d.driverId, d.displayName]) ?? []),
    [driversData],
  )

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 50)) : 1
  const currentPage = filters.page ?? 1

  const handleRowClick = useCallback((orderId: string) => {
    navigate(`/dispatcher/orders/${orderId}`)
  }, [navigate])

  const handleExportCsv = useCallback(() => {
    const rows = data?.items ?? []
    const csvRows: CsvOrderRow[] = rows.map((o) => ({
      publicCode: o.publicCode,
      createdAt: o.createdAt,
      scheduledAt: o.scheduledAt,
      customerPhone: o.customerPhone,
      customerName: o.customerName,
      pickupAddress: o.pickupAddress,
      dropoffAddress: o.dropoffAddress,
      estimatedPriceCzk: o.estimatedPriceCzk,
      fixedPriceCzk: o.fixedPriceCzk,
      driverName: o.driverId ? (driverNameMap.get(o.driverId) ?? null) : null,
      status: o.status,
    }))
    const csv = exportOrdersToCsv(csvRows)
    downloadCsv(csv, getCsvFilename())
  }, [data, driverNameMap])

  return (
    <Page>
      <SearchFilters
        filters={filters}
        onFiltersChange={setFilters}
        onExportCsv={handleExportCsv}
      />

      <TableContainer>
        <Table>
          <thead>
            <tr>
              <Th>{t('search.table.code')}</Th>
              <Th>{t('search.table.created')}</Th>
              <Th>{t('search.table.when')}</Th>
              <Th>{t('search.table.customer')}</Th>
              <Th>{t('search.table.route')}</Th>
              <Th>{t('search.table.price')}</Th>
              <Th>{t('search.table.driver')}</Th>
              <Th>{t('search.table.status')}</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8}>
                  <EmptyMessage>{t('search.table.loading')}</EmptyMessage>
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyMessage>{t('search.table.noResults')}</EmptyMessage>
                </td>
              </tr>
            ) : (
              data.items.map((order) => (
                <Tr
                  key={order.id}
                  onClick={() => handleRowClick(order.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={order.publicCode}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleRowClick(order.id)
                  }}
                >
                  <Td title={order.publicCode}>{order.publicCode}</Td>
                  <Td>{new Date(order.createdAt).toLocaleDateString('cs-CZ')}</Td>
                  <Td>{formatWhen(order, t)}</Td>
                  <Td title={`${order.customerPhone} ${order.customerName ?? ''}`}>
                    {order.customerPhone}
                    {order.customerName ? ` ${order.customerName}` : ''}
                  </Td>
                  <Td title={`${order.pickupAddress} → ${order.dropoffAddress ?? ''}`}>
                    {order.pickupAddress}
                    {order.dropoffAddress ? ` → ${order.dropoffAddress}` : ''}
                  </Td>
                  <Td>{formatPrice(order)}</Td>
                  <Td>
                    {order.driverId
                      ? (driverNameMap.get(order.driverId) ?? t('search.table.noDriver'))
                      : t('search.table.noDriver')}
                  </Td>
                  <Td>
                    <StatusPill $status={order.status}>
                      {t(`status.order.${order.status}`)}
                    </StatusPill>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </TableContainer>

      {data && data.total > (filters.pageSize ?? 50) && (
        <Pagination>
          <PaginationButton
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            {t('search.pagination.prev')}
          </PaginationButton>
          <span>
            {t('search.pagination.page', {
              page: currentPage,
              total: totalPages,
            })}
          </span>
          <PaginationButton
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            {t('search.pagination.next')}
          </PaginationButton>
        </Pagination>
      )}
    </Page>
  )
}

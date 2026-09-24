import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import {
  Panel,
  PanelHeader,
  DeskButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  DeskPill,
} from '../../shared/ui/desk'
import { useOrderSearch } from './useOrderSearch'
import { SearchFilters } from './SearchFilters'
import { getOrderStatusTone } from './orderStatusTone'
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
  padding: 20px 24px;

  & > section {
    flex: 1;
    overflow: hidden;
  }
`

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
`

const ClickableRow = styled(Tr)`
  cursor: pointer;
`

const RowButton = styled.button`
  all: unset;
  cursor: pointer;
  font-weight: var(--fw-bold);
  color: var(--ink);

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
    border-radius: var(--r-sm);
  }
`

const Ellipsis = styled(Td)`
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const EmptyMessage = styled.div`
  padding: 40px;
  text-align: center;
  color: var(--ink-3);
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
`

const PageInfo = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
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

  // Load drivers for name lookup in CSV export + table
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
      <Panel>
        <PanelHeader
          title={t('nav.orders')}
          right={
            <>
              {data && <span>{t('search.resultCount', { count: data.total })}</span>}
              <DeskButton variant="secondary" size="xs" onClick={handleExportCsv}>
                {t('search.filters.exportCsv')}
              </DeskButton>
            </>
          }
        />

        <SearchFilters filters={filters} onFiltersChange={setFilters} />

        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('search.table.code')}</Th>
                <Th>{t('search.table.created')}</Th>
                <Th>{t('search.table.when')}</Th>
                <Th>{t('search.table.customer')}</Th>
                <Th>{t('search.table.route')}</Th>
                <Th $num>{t('search.table.price')}</Th>
                <Th>{t('search.table.driver')}</Th>
                <Th>{t('search.table.status')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {isLoading ? (
                <Tr>
                  <Td colSpan={8}>
                    <EmptyMessage>{t('search.table.loading')}</EmptyMessage>
                  </Td>
                </Tr>
              ) : !data || data.items.length === 0 ? (
                <Tr>
                  <Td colSpan={8}>
                    <EmptyMessage>{t('search.table.noResults')}</EmptyMessage>
                  </Td>
                </Tr>
              ) : (
                data.items.map((order) => (
                  // Whole-row mouse click opens the drawer (design §4 "Row click still opens the
                  // drawer"). No role/tabIndex is added to the <tr> so the table's ARIA semantics
                  // stay intact; the keyboard/AT path is the real <button> in the code cell below.
                  // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                  <ClickableRow key={order.id} onClick={() => handleRowClick(order.id)}>
                    <Td>
                      <RowButton
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRowClick(order.id)
                        }}
                        title={order.publicCode}
                      >
                        {order.publicCode}
                      </RowButton>
                    </Td>
                    <Td>{new Date(order.createdAt).toLocaleDateString('cs-CZ')}</Td>
                    <Td>{formatWhen(order, t)}</Td>
                    <Ellipsis title={`${order.customerPhone} ${order.customerName ?? ''}`}>
                      {order.customerPhone}
                      {order.customerName ? ` ${order.customerName}` : ''}
                    </Ellipsis>
                    <Ellipsis title={`${order.pickupAddress} → ${order.dropoffAddress ?? ''}`}>
                      {order.pickupAddress}
                      {order.dropoffAddress ? ` → ${order.dropoffAddress}` : ''}
                    </Ellipsis>
                    <Td $num>{formatPrice(order)}</Td>
                    <Td>
                      {order.driverId
                        ? (driverNameMap.get(order.driverId) ?? t('search.table.noDriver'))
                        : t('search.table.noDriver')}
                    </Td>
                    <Td>
                      <DeskPill tone={getOrderStatusTone(order.status)}>
                        {t(`status.order.${order.status}`)}
                      </DeskPill>
                    </Td>
                  </ClickableRow>
                ))
              )}
            </Tbody>
          </Table>
        </TableContainer>

        {data && data.total > (filters.pageSize ?? 50) && (
          <Footer>
            <DeskButton
              variant="outline"
              size="xs"
              disabled={currentPage <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              {t('search.pagination.prev')}
            </DeskButton>
            <PageInfo>
              {t('search.pagination.page', { page: currentPage, total: totalPages })}
            </PageInfo>
            <DeskButton
              variant="outline"
              size="xs"
              disabled={currentPage >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              {t('search.pagination.next')}
            </DeskButton>
          </Footer>
        )}
      </Panel>
    </Page>
  )
}

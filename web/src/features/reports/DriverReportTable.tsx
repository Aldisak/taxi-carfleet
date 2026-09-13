import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { formatCzk } from '../../shared/format/money'
import { sumDays } from './reportTotals'
import type { DriverReportResponse } from '../../shared/api/client'

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  background: ${({ theme }) => theme.colors.surface};
`

const Th = styled.th`
  text-align: right;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};

  &:first-child {
    text-align: left;
  }
`

const Td = styled.td`
  text-align: right;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};

  &:first-child {
    text-align: left;
  }
`

const TotalsRow = styled.tr`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  background: ${({ theme }) => theme.colors.background};
`

const Empty = styled.p`
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
`

function formatDay(isoDay: string): string {
  const [y, m, d] = isoDay.split('-')
  return `${d}.${m}.${y}`
}

interface DriverReportTableProps {
  report: DriverReportResponse
}

/** Renders the per-day driver report with a totals footer (recomputed client-side). */
export function DriverReportTable({ report }: DriverReportTableProps) {
  const { t } = useTranslation()

  if (report.days.length === 0) {
    return <Empty>{t('reports.table.empty')}</Empty>
  }

  const totals = sumDays(report.days)

  return (
    <Table>
      <thead>
        <tr>
          <Th scope="col">{t('reports.table.day')}</Th>
          <Th scope="col">{t('reports.table.completed')}</Th>
          <Th scope="col">{t('reports.table.cancelled')}</Th>
          <Th scope="col">{t('reports.table.cash')}</Th>
          <Th scope="col">{t('reports.table.card')}</Th>
          <Th scope="col">{t('reports.table.invoice')}</Th>
          <Th scope="col">{t('reports.table.total')}</Th>
          <Th scope="col">{t('reports.table.hoursOnline')}</Th>
          <Th scope="col">{t('reports.table.priceOverrides')}</Th>
        </tr>
      </thead>
      <tbody>
        {report.days.map(day => (
          <tr key={day.date}>
            <Td>{formatDay(day.date)}</Td>
            <Td>{day.ridesCompleted}</Td>
            <Td>{day.ridesCancelled}</Td>
            <Td>{formatCzk(day.cashCzk)}</Td>
            <Td>{formatCzk(day.cardCzk)}</Td>
            <Td>{formatCzk(day.invoiceCzk)}</Td>
            <Td>{formatCzk(day.totalCzk)}</Td>
            <Td>{day.hoursOnline}</Td>
            <Td>{day.priceOverrideCount}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <TotalsRow>
          <Td>{t('reports.table.totalsRow')}</Td>
          <Td>{totals.ridesCompleted}</Td>
          <Td>{totals.ridesCancelled}</Td>
          <Td>{formatCzk(totals.cashCzk)}</Td>
          <Td>{formatCzk(totals.cardCzk)}</Td>
          <Td>{formatCzk(totals.invoiceCzk)}</Td>
          <Td>{formatCzk(totals.totalCzk)}</Td>
          <Td>{totals.hoursOnline}</Td>
          <Td>{totals.priceOverrideCount}</Td>
        </TotalsRow>
      </tfoot>
    </Table>
  )
}

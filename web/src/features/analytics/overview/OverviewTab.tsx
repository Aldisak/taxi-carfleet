import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Line } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsOverview } from '../useAnalyticsOverview'
import { buildOverviewChartConfig } from './overviewChart'
import { formatCzk } from '../../../shared/format/money'
import type { AnalyticsOverviewParams, OverviewKpiDto, OverviewDeltaDto } from '../../../shared/api/client'

// ── Styled components ─────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`

const KpiGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin: 0;
`

const KpiCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  position: relative;
`

const KpiLabel = styled.dt`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`

const KpiValue = styled.dd`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const DeltaBadge = styled.span<{ $positive: boolean }>`
  display: inline-block;
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme, $positive }) => ($positive ? theme.colors.success : theme.colors.error)};
  margin-left: ${({ theme }) => theme.spacing.xs};
`

const ChartSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const SrOnlyTable = styled.table`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const EmptyState = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`

const ErrorMessage = styled.p`
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
`

const LoadingMessage = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.lg};
`

// ── Helpers ────────────────────────────────────────────────────────────────────

const DASH = '—'

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`
}

function formatHours(h: number): string {
  return `${h.toFixed(1)} h`
}

function formatRating(r: number | null): string {
  if (r === null) return DASH
  return r.toFixed(1)
}

interface KpiItem {
  key: keyof OverviewKpiDto
  label: string
  format: (kpi: OverviewKpiDto) => string
  delta?: (d: OverviewDeltaDto) => number | null
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface OverviewTabProps {
  params: AnalyticsOverviewParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Overview tab — KPI cards + delta badges + trend chart + accessible table. */
export function OverviewTab({ params }: OverviewTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsOverview(params)

  const kpiItems: KpiItem[] = [
    { key: 'rides', label: t('analytics.overview.rides'), format: k => String(k.rides), delta: d => d.rides },
    { key: 'revenueCzk', label: t('analytics.overview.revenueCzk'), format: k => formatCzk(k.revenueCzk), delta: d => d.revenueCzk },
    { key: 'aov', label: t('analytics.overview.aov'), format: k => formatCzk(k.aov), delta: d => d.aov },
    { key: 'fulfillmentRate', label: t('analytics.overview.fulfillmentRate'), format: k => formatPercent(k.fulfillmentRate), delta: d => Math.round(d.fulfillmentRate * 100) },
    { key: 'cancellationRate', label: t('analytics.overview.cancellationRate'), format: k => formatPercent(k.cancellationRate), delta: d => Math.round(d.cancellationRate * 100) },
    { key: 'activeCustomers', label: t('analytics.overview.activeCustomers'), format: k => String(k.activeCustomers), delta: d => d.activeCustomers },
    { key: 'newCustomers', label: t('analytics.overview.newCustomers'), format: k => String(k.newCustomers), delta: d => d.newCustomers },
    { key: 'activeDrivers', label: t('analytics.overview.activeDrivers'), format: k => String(k.activeDrivers), delta: d => d.activeDrivers },
    { key: 'onlineDriverHours', label: t('analytics.overview.onlineDriverHours'), format: k => formatHours(k.onlineDriverHours), delta: d => Math.round(d.onlineDriverHours) },
    { key: 'revenuePerOnlineHour', label: t('analytics.overview.revenuePerOnlineHour'), format: k => formatCzk(Math.round(k.revenuePerOnlineHour)), delta: d => Math.round(d.revenuePerOnlineHour) },
    { key: 'avgRating', label: t('analytics.overview.avgRating'), format: k => formatRating(k.avgRating), delta: d => d.avgRating },
  ]

  if (isLoading) {
    return <LoadingMessage>{t('analytics.overview.loading')}</LoadingMessage>
  }

  if (isError || !data) {
    return <ErrorMessage>{t('analytics.overview.error')}</ErrorMessage>
  }

  const chartConfig = buildOverviewChartConfig(
    data.series,
    t('analytics.overview.rides'),
    t('analytics.overview.revenueCzk'),
  )

  return (
    <Wrapper>
      {/* KPI cards */}
      <KpiGrid>
        {kpiItems.map(item => {
          const deltaVal = data.deltas && item.delta ? item.delta(data.deltas) : null
          const isPositive = deltaVal !== null && deltaVal > 0
          const isNegative = deltaVal !== null && deltaVal < 0

          return (
            <KpiCard key={item.key}>
              <KpiLabel>{item.label}</KpiLabel>
              <KpiValue>
                {item.format(data.current)}
                {deltaVal !== null && deltaVal !== 0 && (
                  <DeltaBadge $positive={isPositive} aria-label={isPositive ? t('analytics.overview.deltaPositive', { value: deltaVal }) : t('analytics.overview.deltaNegative', { value: deltaVal })}>
                    {isPositive ? `+${deltaVal}` : isNegative ? `${deltaVal}` : null}
                  </DeltaBadge>
                )}
              </KpiValue>
            </KpiCard>
          )
        })}
      </KpiGrid>

      {/* Trend chart */}
      <ChartSection aria-label={t('analytics.overview.chartLabel')}>
        {data.series.length === 0 ? (
          <EmptyState>{t('analytics.overview.empty')}</EmptyState>
        ) : (
          <>
            <Line
              data={chartConfig.data}
              options={chartConfig.options as object}
              aria-label={t('analytics.overview.chartLabel')}
            />
            {/* Accessible data table for screen readers */}
            <SrOnlyTable>
              <caption>{t('analytics.overview.chartTableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.overview.chartTableBucket')}</th>
                  <th scope="col">{t('analytics.overview.chartTableRides')}</th>
                  <th scope="col">{t('analytics.overview.chartTableRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {data.series.map(row => (
                  <tr key={row.bucket}>
                    <td>{row.bucket}</td>
                    <td>{row.rides}</td>
                    <td>{row.revenueCzk}</td>
                  </tr>
                ))}
              </tbody>
            </SrOnlyTable>
          </>
        )}
      </ChartSection>
    </Wrapper>
  )
}

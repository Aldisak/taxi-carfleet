import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsRevenue } from '../useAnalyticsRevenue'
import {
  buildRevenueStackedBarConfig,
  buildSourceDoughnutConfig,
  buildPriceTypeDoughnutConfig,
  buildAovTrendLineConfig,
  buildSmsCostLineConfig,
} from './revenueCharts'
import { buildRevenueTopRoutesCsv, buildZoneRevenueCsv } from './revenueCsv'
import { formatCzk } from '../../../shared/format/money'
import type { AnalyticsRevenueParams } from '../../../shared/api/client'

// ── Styled components ─────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

/** Visually hidden — available for screen readers alongside charts. */
const SrOnlyTable = styled.table`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
`

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const LoadingMessage = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.lg};
`

const ErrorMessage = styled.p`
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
`

const StatGrid = styled.dl`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  margin: 0;
`

const StatCard = styled.div`
  display: inline-flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  min-width: 160px;
`

const StatLabel = styled.dt`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const StatValue = styled.dd`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const DoughnutRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xl};
`

const DoughnutItem = styled.div`
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const CsvButton = styled.button`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.primary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Triggers a browser download for a UTF-8 CSV string. */
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface RevenueTabProps {
  params: AnalyticsRevenueParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Revenue (Tržby) analytics tab — payment types, source/price splits, AOV, override, routes/zones, SMS cost. */
export function RevenueTab({ params }: RevenueTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsRevenue(params)

  if (isLoading) {
    return <LoadingMessage>{t('analytics.revenue.loading')}</LoadingMessage>
  }

  if (isError || !data) {
    return <ErrorMessage>{t('analytics.revenue.error')}</ErrorMessage>
  }

  const stackedBarConfig = buildRevenueStackedBarConfig(data.series)
  const sourceDoughnutConfig = buildSourceDoughnutConfig(data.series)
  const priceTypeDoughnutConfig = buildPriceTypeDoughnutConfig(data.series)
  const aovTrendConfig = buildAovTrendLineConfig(data.aovTrend)
  const smsCostConfig = buildSmsCostLineConfig(data.smsCost)

  return (
    <Wrapper>
      {/* ── Revenue Stacked Bar ── */}
      <Section aria-labelledby="rev-series-title">
        <SectionTitle id="rev-series-title">{t('analytics.revenue.series.title')}</SectionTitle>

        <Bar
          data={stackedBarConfig.data as Parameters<typeof Bar>[0]['data']}
          options={stackedBarConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.revenue.series.title')}
        />

        {/* Screen-reader fallback table */}
        <SrOnlyTable>
          <caption>{t('analytics.revenue.series.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.revenue.series.tableBucket')}</th>
              <th scope="col">{t('analytics.revenue.series.tableCash')}</th>
              <th scope="col">{t('analytics.revenue.series.tableCard')}</th>
              <th scope="col">{t('analytics.revenue.series.tableInvoice')}</th>
              <th scope="col">{t('analytics.revenue.series.tableTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map(b => (
              <tr key={b.bucket}>
                <td>{b.bucket}</td>
                <td>{formatCzk(b.cashCzk)}</td>
                <td>{formatCzk(b.cardCzk)}</td>
                <td>{formatCzk(b.invoiceCzk)}</td>
                <td>{formatCzk(b.totalCzk)}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Source and Price-Type Doughnuts ── */}
      <DoughnutRow>
        <DoughnutItem>
          <Section aria-labelledby="rev-source-title">
            <SectionTitle id="rev-source-title">{t('analytics.revenue.source.title')}</SectionTitle>

            <Doughnut
              data={sourceDoughnutConfig.data as Parameters<typeof Doughnut>[0]['data']}
              options={sourceDoughnutConfig.options as Parameters<typeof Doughnut>[0]['options']}
              aria-label={t('analytics.revenue.source.title')}
            />

            <SrOnlyTable>
              <caption>{t('analytics.revenue.source.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.revenue.source.tableSource')}</th>
                  <th scope="col">{t('analytics.revenue.source.tableRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Aplikace</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.appCzk, 0))}</td>
                </tr>
                <tr>
                  <td>Telefon</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.phoneCzk, 0))}</td>
                </tr>
                <tr>
                  <td>Dispečink</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.dispatcherCzk, 0))}</td>
                </tr>
              </tbody>
            </SrOnlyTable>
          </Section>
        </DoughnutItem>

        <DoughnutItem>
          <Section aria-labelledby="rev-pricetype-title">
            <SectionTitle id="rev-pricetype-title">{t('analytics.revenue.priceType.title')}</SectionTitle>

            <Doughnut
              data={priceTypeDoughnutConfig.data as Parameters<typeof Doughnut>[0]['data']}
              options={priceTypeDoughnutConfig.options as Parameters<typeof Doughnut>[0]['options']}
              aria-label={t('analytics.revenue.priceType.title')}
            />

            <SrOnlyTable>
              <caption>{t('analytics.revenue.priceType.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.revenue.priceType.tablePriceType')}</th>
                  <th scope="col">{t('analytics.revenue.priceType.tableRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Taxametr</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.meterCzk, 0))}</td>
                </tr>
                <tr>
                  <td>Pevná cena</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.fixedCzk, 0))}</td>
                </tr>
                <tr>
                  <td>Odhad</td>
                  <td>{formatCzk(data.series.reduce((s, b) => s + b.estimateCzk, 0))}</td>
                </tr>
              </tbody>
            </SrOnlyTable>
          </Section>
        </DoughnutItem>
      </DoughnutRow>

      {/* ── AOV Trend ── */}
      <Section aria-labelledby="rev-aov-title">
        <SectionTitle id="rev-aov-title">{t('analytics.revenue.aovTrend.title')}</SectionTitle>

        <Line
          data={aovTrendConfig.data as Parameters<typeof Line>[0]['data']}
          options={aovTrendConfig.options as Parameters<typeof Line>[0]['options']}
          aria-label={t('analytics.revenue.aovTrend.title')}
        />

        <SrOnlyTable>
          <caption>{t('analytics.revenue.aovTrend.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.revenue.aovTrend.tableBucket')}</th>
              <th scope="col">{t('analytics.revenue.aovTrend.tableAov')}</th>
            </tr>
          </thead>
          <tbody>
            {data.aovTrend.map(b => (
              <tr key={b.bucket}>
                <td>{b.bucket}</td>
                <td>{formatCzk(b.aovCzk)}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Price Override Impact ── */}
      <Section aria-labelledby="rev-override-title">
        <SectionTitle id="rev-override-title">{t('analytics.revenue.priceOverride.title')}</SectionTitle>

        <StatGrid>
          <StatCard>
            <StatLabel>{t('analytics.revenue.priceOverride.count')}</StatLabel>
            <StatValue>{data.priceOverride.count}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.revenue.priceOverride.totalDelta')}</StatLabel>
            <StatValue>{formatCzk(data.priceOverride.totalDeltaCzk)}</StatValue>
          </StatCard>
        </StatGrid>

        {data.priceOverride.topReasons.length > 0 && (
          <DataTable>
            <caption>{t('analytics.revenue.priceOverride.reasonsTitle')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.revenue.priceOverride.tableReason')}</Th>
                <Th scope="col">{t('analytics.revenue.priceOverride.tableCount')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.priceOverride.topReasons.map(r => (
                <tr key={r.reason}>
                  <Td>{r.reason}</Td>
                  <Td>{r.count}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      {/* ── Top Routes ── */}
      <Section aria-labelledby="rev-routes-title">
        <SectionHeader>
          <SectionTitle id="rev-routes-title">{t('analytics.revenue.topRoutes.title')}</SectionTitle>
          <CsvButton
            type="button"
            onClick={() => downloadCsv(buildRevenueTopRoutesCsv(data.topRoutes), 'trasy-trzby.csv')}
          >
            {t('analytics.revenue.topRoutes.csvLabel')}
          </CsvButton>
        </SectionHeader>

        {data.topRoutes.length > 0 ? (
          <DataTable>
            <caption>{t('analytics.revenue.topRoutes.tableCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.revenue.topRoutes.tableFrom')}</Th>
                <Th scope="col">{t('analytics.revenue.topRoutes.tableTo')}</Th>
                <Th scope="col">{t('analytics.revenue.topRoutes.tableRides')}</Th>
                <Th scope="col">{t('analytics.revenue.topRoutes.tableRevenue')}</Th>
                <Th scope="col">{t('analytics.revenue.topRoutes.tableAov')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.topRoutes.map((r, i) => (
                <tr key={i}>
                  <Td>{r.pickupAddress}</Td>
                  <Td>{r.dropoffAddress}</Td>
                  <Td>{r.rides}</Td>
                  <Td>{formatCzk(r.revenueCzk)}</Td>
                  <Td>{formatCzk(r.aovCzk)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p>{t('analytics.revenue.empty')}</p>
        )}
      </Section>

      {/* ── Zone Revenue ── */}
      <Section aria-labelledby="rev-zones-title">
        <SectionHeader>
          <SectionTitle id="rev-zones-title">{t('analytics.revenue.zoneRevenue.title')}</SectionTitle>
          <CsvButton
            type="button"
            onClick={() => downloadCsv(buildZoneRevenueCsv(data.zoneRevenue), 'zony-trzby.csv')}
          >
            {t('analytics.revenue.zoneRevenue.csvLabel')}
          </CsvButton>
        </SectionHeader>

        {data.zoneRevenue.length > 0 ? (
          <DataTable>
            <caption>{t('analytics.revenue.zoneRevenue.tableCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.revenue.zoneRevenue.tableZone')}</Th>
                <Th scope="col">{t('analytics.revenue.zoneRevenue.tableRides')}</Th>
                <Th scope="col">{t('analytics.revenue.zoneRevenue.tableRevenue')}</Th>
                <Th scope="col">{t('analytics.revenue.zoneRevenue.tableAov')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.zoneRevenue.map(z => (
                <tr key={z.zoneId}>
                  <Td>{z.zoneName}</Td>
                  <Td>{z.rides}</Td>
                  <Td>{formatCzk(z.revenueCzk)}</Td>
                  <Td>{formatCzk(z.aovCzk)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p>{t('analytics.revenue.empty')}</p>
        )}
      </Section>

      {/* ── SMS Cost Line ── */}
      <Section aria-labelledby="rev-sms-title">
        <SectionTitle id="rev-sms-title">{t('analytics.revenue.smsCost.title')}</SectionTitle>

        <Line
          data={smsCostConfig.data as Parameters<typeof Line>[0]['data']}
          options={smsCostConfig.options as Parameters<typeof Line>[0]['options']}
          aria-label={t('analytics.revenue.smsCost.title')}
        />

        <SrOnlyTable>
          <caption>{t('analytics.revenue.smsCost.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.revenue.smsCost.tableBucket')}</th>
              <th scope="col">{t('analytics.revenue.smsCost.tableSmsCount')}</th>
              <th scope="col">{t('analytics.revenue.smsCost.tableCost')}</th>
            </tr>
          </thead>
          <tbody>
            {data.smsCost.map(b => (
              <tr key={b.bucket}>
                <td>{b.bucket}</td>
                <td>{b.smsCount}</td>
                <td>{formatCzk(b.costCzk)}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      </Section>
    </Wrapper>
  )
}

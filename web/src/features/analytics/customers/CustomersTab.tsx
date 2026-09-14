import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Bar, Line } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsCustomers } from '../useAnalyticsCustomers'
import {
  buildNewVsReturningBarConfig,
  buildRatingsDistributionBarConfig,
  buildRatingsTrendLineConfig,
} from './customersCharts'
import { buildCohortCsv } from './cohortCsv'
import { downloadCsv } from '../../../shared/csv/toCsv'
import type { AnalyticsCustomersParams } from '../../../shared/api/client'

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
  min-width: 120px;
`

const StatLabel = styled.dt`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

const StatValue = styled.dd`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const ExportButton = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomersTabProps {
  params: AnalyticsCustomersParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Zákazníci analytics tab: new vs returning, cohort retention, top customers, ratings. */
export function CustomersTab({ params }: CustomersTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsCustomers(params)

  if (isLoading) return <LoadingMessage>{t('analytics.customers.loading')}</LoadingMessage>
  if (isError || !data) return <ErrorMessage>{t('analytics.customers.error')}</ErrorMessage>

  const summaryId = 'customers-summary-title'
  const newVsRetId = 'customers-newvsret-title'
  const cohortId = 'customers-cohort-title'
  const topId = 'customers-top-title'
  const ratingsId = 'customers-ratings-title'
  const distributionId = 'customers-dist-title'
  const trendId = 'customers-trend-title'
  const worstId = 'customers-worst-title'

  const newVsReturningConfig = buildNewVsReturningBarConfig(
    data.newVsReturningBuckets,
    t('analytics.customers.newVsReturning.newLabel'),
    t('analytics.customers.newVsReturning.returningLabel'),
  )

  const distributionConfig = buildRatingsDistributionBarConfig(
    data.ratings.distribution,
    t('analytics.customers.ratings.distribution.datasetLabel'),
  )
  const trendConfig = buildRatingsTrendLineConfig(
    data.ratings.avgTrend,
    t('analytics.customers.ratings.avgRating'),
  )

  const cohortRows = data.cohortRows
  function handleExportCohortCsv() {
    const csv = buildCohortCsv(cohortRows)
    downloadCsv(csv, 'kohortova-retence.csv')
  }

  return (
    <Wrapper>
      {/* Summary stats */}
      <Section aria-labelledby={summaryId}>
        <SectionTitle id={summaryId}>{t('analytics.customers.summary.title')}</SectionTitle>
        <StatGrid>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.totalRides')}</StatLabel>
            <StatValue>{data.totalRides}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.newIdentities')}</StatLabel>
            <StatValue>{data.newIdentities}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.returningIdentities')}</StatLabel>
            <StatValue>{data.returningIdentities}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.repeatRate')}</StatLabel>
            <StatValue>{data.repeatRate.toFixed(1)}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.freqOne')}</StatLabel>
            <StatValue>{data.freqOne}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.freqTwoToFive')}</StatLabel>
            <StatValue>{data.freqTwoToFive}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.summary.freqSixPlus')}</StatLabel>
            <StatValue>{data.freqSixPlus}</StatValue>
          </StatCard>
        </StatGrid>
      </Section>

      {/* New vs returning chart */}
      {data.newVsReturningBuckets.length > 0 && (
        <Section aria-labelledby={newVsRetId}>
          <SectionTitle id={newVsRetId}>{t('analytics.customers.newVsReturning.title')}</SectionTitle>
          <Bar
            data={newVsReturningConfig.data as Parameters<typeof Bar>[0]['data']}
            options={newVsReturningConfig.options as Parameters<typeof Bar>[0]['options']}
            aria-label={t('analytics.customers.newVsReturning.title')}
          />
          <SrOnlyTable>
            <caption>{t('analytics.customers.newVsReturning.tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('analytics.customers.newVsReturning.tableBucket')}</th>
                <th scope="col">{t('analytics.customers.newVsReturning.tableNew')}</th>
                <th scope="col">{t('analytics.customers.newVsReturning.tableReturning')}</th>
              </tr>
            </thead>
            <tbody>
              {data.newVsReturningBuckets.map(b => (
                <tr key={b.bucket}>
                  <td>{b.bucket}</td>
                  <td>{b.newRides}</td>
                  <td>{b.returningRides}</td>
                </tr>
              ))}
            </tbody>
          </SrOnlyTable>
        </Section>
      )}

      {/* Cohort retention table */}
      {data.cohortRows.length > 0 && (
        <Section aria-labelledby={cohortId}>
          <SectionHeader>
            <SectionTitle id={cohortId}>{t('analytics.customers.cohort.title')}</SectionTitle>
            <ExportButton type="button" onClick={handleExportCohortCsv}>
              {t('analytics.customers.cohort.csvLabel')}
            </ExportButton>
          </SectionHeader>
          <DataTable>
            <caption>{t('analytics.customers.cohort.tableCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.customers.cohort.tableAcqMonth')}</Th>
                {/* Month columns are computed from the data */}
                {[...new Set(data.cohortRows.map(r => r.monthsSince))].sort((a, b) => a - b).map(m => (
                  <Th key={m} scope="col">{t('analytics.customers.cohort.monthHeader', { n: m })}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(data.cohortRows.map(r => r.acqMonthLabel))].map(acq => {
                const rowsForAcq = data.cohortRows.filter(r => r.acqMonthLabel === acq)
                const monthsSince = [...new Set(data.cohortRows.map(r => r.monthsSince))].sort((a, b) => a - b)
                return (
                  <tr key={acq}>
                    <Td>{acq}</Td>
                    {monthsSince.map(m => {
                      const cell = rowsForAcq.find(r => r.monthsSince === m)
                      return <Td key={m}>{cell?.activeCustomers ?? ''}</Td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Section>
      )}

      {/* Top customers */}
      {data.topCustomers.length > 0 && (
        <Section aria-labelledby={topId}>
          <SectionTitle id={topId}>{t('analytics.customers.topCustomers.title')}</SectionTitle>
          <DataTable>
            <caption>{t('analytics.customers.topCustomers.tableCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.customers.topCustomers.tableCustomer')}</Th>
                <Th scope="col">{t('analytics.customers.topCustomers.tablePhone')}</Th>
                <Th scope="col">{t('analytics.customers.topCustomers.tableRides')}</Th>
                <Th scope="col">{t('analytics.customers.topCustomers.tableRevenue')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.topCustomers.map((c, i) => (
                <tr key={c.customerUserId ?? c.customerPhone ?? i}>
                  <Td>{c.customerName ?? t('analytics.customers.topCustomers.unknown')}</Td>
                  <Td>{c.customerPhone ?? '—'}</Td>
                  <Td>{c.rides}</Td>
                  <Td>{c.revenueCzk}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}

      {/* Ratings analysis */}
      <Section aria-labelledby={ratingsId}>
        <SectionTitle id={ratingsId}>{t('analytics.customers.ratings.title')}</SectionTitle>
        <StatGrid>
          <StatCard>
            <StatLabel>{t('analytics.customers.ratings.avgRating')}</StatLabel>
            <StatValue>{data.ratings.avgRating !== null ? data.ratings.avgRating.toFixed(2) : '—'}</StatValue>
          </StatCard>
          <StatCard>
            <StatLabel>{t('analytics.customers.ratings.totalRated')}</StatLabel>
            <StatValue>{data.ratings.totalRated}</StatValue>
          </StatCard>
        </StatGrid>

        {/* Distribution chart */}
        {data.ratings.distribution.length > 0 && (
          <Section aria-labelledby={distributionId}>
            <SectionTitle id={distributionId}>{t('analytics.customers.ratings.distribution.title')}</SectionTitle>
            <Bar
              data={distributionConfig.data as Parameters<typeof Bar>[0]['data']}
              options={distributionConfig.options as Parameters<typeof Bar>[0]['options']}
              aria-label={t('analytics.customers.ratings.distribution.title')}
            />
            <SrOnlyTable>
              <caption>{t('analytics.customers.ratings.distribution.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.customers.ratings.distribution.tableStars')}</th>
                  <th scope="col">{t('analytics.customers.ratings.distribution.tableCount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.ratings.distribution.map(d => (
                  <tr key={d.stars}>
                    <td>{d.stars}</td>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </SrOnlyTable>
          </Section>
        )}

        {/* Average trend chart */}
        {data.ratings.avgTrend.length > 0 && (
          <Section aria-labelledby={trendId}>
            <SectionTitle id={trendId}>{t('analytics.customers.ratings.trend.title')}</SectionTitle>
            <Line
              data={trendConfig.data as Parameters<typeof Line>[0]['data']}
              options={trendConfig.options as Parameters<typeof Line>[0]['options']}
              aria-label={t('analytics.customers.ratings.trend.title')}
            />
            <SrOnlyTable>
              <caption>{t('analytics.customers.ratings.trend.tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.customers.ratings.trend.tableBucket')}</th>
                  <th scope="col">{t('analytics.customers.ratings.trend.tableRides')}</th>
                  <th scope="col">{t('analytics.customers.ratings.trend.tableAvg')}</th>
                </tr>
              </thead>
              <tbody>
                {data.ratings.avgTrend.map(row => (
                  <tr key={row.bucket}>
                    <td>{row.bucket}</td>
                    <td>{row.rides}</td>
                    <td>{row.avgRating !== null ? row.avgRating.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </SrOnlyTable>
          </Section>
        )}

        {/* Worst rated orders */}
        <Section aria-labelledby={worstId}>
          <SectionTitle id={worstId}>{t('analytics.customers.ratings.worstRated.title')}</SectionTitle>
          {data.ratings.worstRated.length === 0 ? (
            <p>{t('analytics.customers.ratings.worstRated.empty')}</p>
          ) : (
            <DataTable>
              <caption>{t('analytics.customers.ratings.worstRated.tableCaption')}</caption>
              <thead>
                <tr>
                  <Th scope="col">{t('analytics.customers.ratings.worstRated.tableCode')}</Th>
                  <Th scope="col">{t('analytics.customers.ratings.worstRated.tableCompleted')}</Th>
                  <Th scope="col">{t('analytics.customers.ratings.worstRated.tableStars')}</Th>
                  <Th scope="col">{t('analytics.customers.ratings.worstRated.tableDriver')}</Th>
                  <Th scope="col">{t('analytics.customers.ratings.worstRated.tableComment')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.ratings.worstRated.map(order => (
                  <tr key={order.orderId}>
                    <Td>{order.publicCode}</Td>
                    <Td>{new Date(order.completedAt).toLocaleDateString('cs-CZ')}</Td>
                    <Td>{order.ratingStars}</Td>
                    <Td>{order.driverName ?? '—'}</Td>
                    <Td>{order.ratingComment ?? t('analytics.customers.ratings.worstRated.noComment')}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      </Section>
    </Wrapper>
  )
}

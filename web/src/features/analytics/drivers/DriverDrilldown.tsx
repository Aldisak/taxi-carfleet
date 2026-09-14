import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Line } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useQuery } from '@tanstack/react-query'
import { getAnalyticsDriverDrilldown } from '../../../shared/api/client'
import { buildWeeklyTrendLineConfig } from './driversCharts'
import type { AnalyticsDriversParams } from '../../../shared/api/client'

// ── Styled components ─────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
`

const BackButton = styled.button`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
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

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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

const DriverName = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

// ── Props ─────────────────────────────────────────────────────────────────────

interface DriverDrilldownProps {
  driverId: string
  driverName: string
  params: AnalyticsDriversParams
  onBack: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

/** Driver drill-down view: weekly trend chart + low-rated orders. */
export function DriverDrilldown({ driverId, driverName, params, onBack }: DriverDrilldownProps) {
  const { t } = useTranslation()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'drivers', 'drilldown', driverId, params],
    queryFn: () => getAnalyticsDriverDrilldown(driverId, params),
  })

  const weeklyId = `drilldown-weekly-${driverId}`
  const lowRatedId = `drilldown-lowrated-${driverId}`

  const weeklyTrendConfig = data
    ? buildWeeklyTrendLineConfig(
        data.weeklyTrend,
        t('analytics.drivers.drilldown.tableRides'),
        t('analytics.drivers.drilldown.tableRevenue'),
      )
    : null

  return (
    <Wrapper>
      <BackButton type="button" onClick={onBack} aria-label={t('analytics.drivers.drilldown.backLabel')}>
        ← {t('analytics.drivers.drilldown.backLabel')}
      </BackButton>

      <DriverName>{driverName}</DriverName>

      {isLoading && <LoadingMessage>{t('analytics.drivers.loading')}</LoadingMessage>}
      {isError && <ErrorMessage>{t('analytics.drivers.error')}</ErrorMessage>}

      {data && weeklyTrendConfig && (
        <>
          {/* Weekly trend */}
          <Section aria-labelledby={weeklyId}>
            <SectionTitle id={weeklyId}>{t('analytics.drivers.drilldown.weeklyTitle')}</SectionTitle>
            <Line
              data={weeklyTrendConfig.data as Parameters<typeof Line>[0]['data']}
              options={weeklyTrendConfig.options as Parameters<typeof Line>[0]['options']}
              aria-label={t('analytics.drivers.drilldown.weeklyTitle')}
            />
            <SrOnlyTable>
              <caption>{t('analytics.drivers.drilldown.weeklyCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('analytics.drivers.drilldown.tableWeek')}</th>
                  <th scope="col">{t('analytics.drivers.drilldown.tableRides')}</th>
                  <th scope="col">{t('analytics.drivers.drilldown.tableRevenue')}</th>
                  <th scope="col">{t('analytics.drivers.drilldown.tableRating')}</th>
                </tr>
              </thead>
              <tbody>
                {data.weeklyTrend.map(row => (
                  <tr key={row.weekStart}>
                    <td>{row.weekStart}</td>
                    <td>{row.ridesCompleted}</td>
                    <td>{row.revenueCzk}</td>
                    <td>{row.avgRating ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </SrOnlyTable>
          </Section>

          {/* Low-rated orders */}
          <Section aria-labelledby={lowRatedId}>
            <SectionTitle id={lowRatedId}>{t('analytics.drivers.drilldown.lowRatedTitle')}</SectionTitle>
            {data.lowRatedOrders.length === 0 ? (
              <p>{t('analytics.drivers.drilldown.noLowRated')}</p>
            ) : (
              <DataTable>
                <caption>{t('analytics.drivers.drilldown.lowRatedTitle')}</caption>
                <thead>
                  <tr>
                    <Th scope="col">{t('analytics.drivers.drilldown.tableCode')}</Th>
                    <Th scope="col">{t('analytics.drivers.drilldown.tableCompleted')}</Th>
                    <Th scope="col">{t('analytics.drivers.drilldown.tableStars')}</Th>
                    <Th scope="col">{t('analytics.drivers.drilldown.tablePickup')}</Th>
                    <Th scope="col">{t('analytics.drivers.drilldown.tableDropoff')}</Th>
                    <Th scope="col">{t('analytics.drivers.drilldown.tableComment')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowRatedOrders.map(order => (
                    <tr key={order.orderId}>
                      <Td>{order.publicCode}</Td>
                      <Td>{new Date(order.completedAt).toLocaleDateString('cs-CZ')}</Td>
                      <Td>{order.ratingStars}</Td>
                      <Td>{order.pickupAddress}</Td>
                      <Td>{order.dropoffAddress ?? '—'}</Td>
                      <Td>{order.ratingComment ?? t('analytics.drivers.drilldown.noComment')}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Section>
        </>
      )}
    </Wrapper>
  )
}

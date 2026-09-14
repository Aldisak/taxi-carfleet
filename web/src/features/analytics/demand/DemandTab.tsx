import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Bar } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsDemand } from '../useAnalyticsDemand'
import { buildHeatmapChartConfig, buildSupplyDemandChartConfig, buildUnmetDemandChartConfig } from './demandCharts'
import { buildHeatmapCsv, buildZonePickupsCsv, buildTopRoutesCsv } from './demandCsv'
import { downloadCsv } from '../../../shared/csv/toCsv'
import type { AnalyticsDemandParams } from '../../../shared/api/client'

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

const CsvButton = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
  }
`

const UtilizationCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
  display: inline-flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 180px;
`

const UtilizationLabel = styled.dt`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
`

const UtilizationValue = styled.dd`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
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

const EmptyState = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`
}

function secondsToHours(s: number): string {
  return (s / 3600).toFixed(1)
}

/** DOW labels for sr-only table header (0=Sunday … 6=Saturday, Czech abbreviated). */
const DOW_LABELS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']

// ── Props ──────────────────────────────────────────────────────────────────────

export interface DemandTabProps {
  params: AnalyticsDemandParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Demand analytics tab — heatmap, supply/demand, unmet demand, utilization, zone/route tables. */
export function DemandTab({ params }: DemandTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsDemand(params)

  if (isLoading) {
    return <LoadingMessage>{t('analytics.demand.loading')}</LoadingMessage>
  }

  if (isError || !data) {
    return <ErrorMessage>{t('analytics.demand.error')}</ErrorMessage>
  }

  const isEmpty =
    data.heatmap.length === 0 &&
    data.supplyDemand.length === 0 &&
    data.unmetDemand.length === 0 &&
    data.zonePickups.length === 0 &&
    data.topRoutes.length === 0

  if (isEmpty) {
    return <EmptyState>{t('analytics.demand.empty')}</EmptyState>
  }

  const heatmapConfig = buildHeatmapChartConfig(data.heatmap)
  const supplyDemandConfig = buildSupplyDemandChartConfig(data.supplyDemand)
  const unmetDemandConfig = buildUnmetDemandChartConfig(data.unmetDemand)

  function handleHeatmapCsvExport() {
    const csv = buildHeatmapCsv(data!.heatmap)
    downloadCsv(csv, 'heatmapa-poptavky.csv')
  }

  function handleZonePickupsCsvExport() {
    const csv = buildZonePickupsCsv(data!.zonePickups)
    downloadCsv(csv, 'vyzvednutí-podle-zon.csv')
  }

  function handleTopRoutesCsvExport() {
    const csv = buildTopRoutesCsv(data!.topRoutes)
    downloadCsv(csv, 'nejcastejsi-trasy.csv')
  }

  return (
    <Wrapper>
      {/* ── Heatmap ── */}
      <Section aria-labelledby="demand-heatmap-title">
        <SectionHeader>
          <SectionTitle id="demand-heatmap-title">{t('analytics.demand.heatmap.title')}</SectionTitle>
          <CsvButton type="button" onClick={handleHeatmapCsvExport}>
            {t('analytics.demand.heatmap.csvLabel')}
          </CsvButton>
        </SectionHeader>

        <Bar
          data={heatmapConfig.data as Parameters<typeof Bar>[0]['data']}
          options={heatmapConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.demand.heatmap.title')}
        />

        {/* Screen-reader accessible table */}
        <SrOnlyTable>
          <caption>{t('analytics.demand.heatmap.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.demand.heatmap.tableHour')}</th>
              {DOW_LABELS.map(day => (
                <th key={day} scope="col">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, hour) => {
              const rowCells = DOW_LABELS.map((_, dow) => {
                const cell = data.heatmap.find(c => c.hour === hour && c.dow === dow)
                return cell?.count ?? 0
              })
              return (
                <tr key={hour}>
                  <td>{hour}:00</td>
                  {rowCells.map((count, dow) => (
                    <td key={dow}>{count}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Supply vs Demand ── */}
      <Section aria-labelledby="demand-supply-title">
        <SectionTitle id="demand-supply-title">{t('analytics.demand.supplyDemand.title')}</SectionTitle>

        <Bar
          data={supplyDemandConfig.data as Parameters<typeof Bar>[0]['data']}
          options={supplyDemandConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.demand.supplyDemand.title')}
        />

        <SrOnlyTable>
          <caption>{t('analytics.demand.supplyDemand.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.demand.supplyDemand.tableHour')}</th>
              <th scope="col">{t('analytics.demand.supplyDemand.tableOrders')}</th>
              <th scope="col">{t('analytics.demand.supplyDemand.tableSupplyHours')}</th>
            </tr>
          </thead>
          <tbody>
            {data.supplyDemand.map(b => (
              <tr key={b.hour}>
                <td>{b.hour}:00</td>
                <td>{b.ordersCreated}</td>
                <td>{secondsToHours(b.onlineSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Unmet Demand ── */}
      <Section aria-labelledby="demand-unmet-title">
        <SectionTitle id="demand-unmet-title">{t('analytics.demand.unmetDemand.title')}</SectionTitle>

        <Bar
          data={unmetDemandConfig.data as Parameters<typeof Bar>[0]['data']}
          options={unmetDemandConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.demand.unmetDemand.title')}
        />

        <SrOnlyTable>
          <caption>{t('analytics.demand.unmetDemand.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.demand.unmetDemand.tableHour')}</th>
              <th scope="col">{t('analytics.demand.unmetDemand.tableCount')}</th>
            </tr>
          </thead>
          <tbody>
            {data.unmetDemand.map(b => (
              <tr key={b.hour}>
                <td>{b.hour}:00</td>
                <td>{b.unmetCount}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Utilization ── */}
      <Section aria-labelledby="demand-util-title">
        <SectionTitle id="demand-util-title">{t('analytics.demand.utilization.title')}</SectionTitle>

        <dl>
          <UtilizationCard>
            <UtilizationLabel>{t('analytics.demand.utilization.fleetLabel')}</UtilizationLabel>
            <UtilizationValue>{formatPercent(data.utilization.fleetUtilization)}</UtilizationValue>
          </UtilizationCard>
        </dl>

        {data.utilization.perDriver.length > 0 && (
          <DataTable>
            <caption>{t('analytics.demand.utilization.driverTableCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.demand.utilization.tableDriver')}</Th>
                <Th scope="col">{t('analytics.demand.utilization.tableBusyH')}</Th>
                <Th scope="col">{t('analytics.demand.utilization.tableOnlineH')}</Th>
                <Th scope="col">{t('analytics.demand.utilization.tableUtil')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.utilization.perDriver.map(d => (
                <tr key={d.driverId}>
                  <Td>{d.driverId}</Td>
                  <Td>{secondsToHours(d.busySeconds)}</Td>
                  <Td>{secondsToHours(d.onlineSeconds)}</Td>
                  <Td>{formatPercent(d.utilization)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      {/* ── Zone Pickups ── */}
      <Section aria-labelledby="demand-zones-title">
        <SectionHeader>
          <SectionTitle id="demand-zones-title">{t('analytics.demand.zonePickups.title')}</SectionTitle>
          <CsvButton type="button" onClick={handleZonePickupsCsvExport}>
            {t('analytics.demand.zonePickups.csvLabel')}
          </CsvButton>
        </SectionHeader>

        <DataTable>
          <caption>{t('analytics.demand.zonePickups.tableCaption')}</caption>
          <thead>
            <tr>
              <Th scope="col">{t('analytics.demand.zonePickups.tableZone')}</Th>
              <Th scope="col">{t('analytics.demand.zonePickups.tableCount')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.zonePickups.map(z => (
              <tr key={z.zoneId}>
                <Td>{z.zoneName}</Td>
                <Td>{z.pickupCount}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>

      {/* ── Top Routes ── */}
      <Section aria-labelledby="demand-routes-title">
        <SectionHeader>
          <SectionTitle id="demand-routes-title">{t('analytics.demand.topRoutes.title')}</SectionTitle>
          <CsvButton type="button" onClick={handleTopRoutesCsvExport}>
            {t('analytics.demand.topRoutes.csvLabel')}
          </CsvButton>
        </SectionHeader>

        <DataTable>
          <caption>{t('analytics.demand.topRoutes.tableCaption')}</caption>
          <thead>
            <tr>
              <Th scope="col">{t('analytics.demand.topRoutes.tableFrom')}</Th>
              <Th scope="col">{t('analytics.demand.topRoutes.tableTo')}</Th>
              <Th scope="col">{t('analytics.demand.topRoutes.tableCount')}</Th>
            </tr>
          </thead>
          <tbody>
            {data.topRoutes.map((r, idx) => (
              <tr key={idx}>
                <Td>{r.pickupAddress}</Td>
                <Td>{r.dropoffAddress}</Td>
                <Td>{r.count}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>
    </Wrapper>
  )
}

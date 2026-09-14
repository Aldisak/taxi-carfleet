import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Bar, Doughnut } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsOperations } from '../useAnalyticsOperations'
import {
  buildSlaBarChartConfig,
  buildOfferFunnelChartConfig,
  buildLifecycleFunnelChartConfig,
  buildCancellationDoughnutChartConfig,
} from './operationsCharts'
import type { AnalyticsOperationsParams, SlaPercentileDto } from '../../../shared/api/client'

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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Formats seconds as "Xm Ys" for display. Returns "—" when metric is null. */
function formatSeconds(metric: SlaPercentileDto | null, field: 'median' | 'p90'): string {
  if (metric === null) return '—'
  const s = metric[field]
  const mins = Math.floor(s / 60)
  const secs = Math.round(s % 60)
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

/** Czech SLA metric labels (aligned with chart builder labels). */
const SLA_ROW_LABELS = [
  'Čas k přiřazení',
  'Čas k přijetí',
  'Čas k vyzvednutí',
  'Délka jízdy',
]

// ── Props ──────────────────────────────────────────────────────────────────────

export interface OperationsTabProps {
  params: AnalyticsOperationsParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Operations / SLA analytics tab — SLA, offer funnel, lifecycle, cancellations. */
export function OperationsTab({ params }: OperationsTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsOperations(params)

  if (isLoading) {
    return <LoadingMessage>{t('analytics.operations.loading')}</LoadingMessage>
  }

  if (isError || !data) {
    return <ErrorMessage>{t('analytics.operations.error')}</ErrorMessage>
  }

  const slaMetrics = [
    data.sla.timeToAssign,
    data.sla.timeToAccept,
    data.sla.timeToPickup,
    data.sla.rideDuration,
  ]

  const slaConfig = buildSlaBarChartConfig(data.sla)
  const offerFunnelConfig = buildOfferFunnelChartConfig(data.offerFunnel)
  const lifecycleConfig = buildLifecycleFunnelChartConfig(data.lifecycle)
  const cancellationConfig = buildCancellationDoughnutChartConfig(data.cancellations)

  return (
    <Wrapper>
      {/* ── SLA Metrics ── */}
      <Section aria-labelledby="ops-sla-title">
        <SectionHeader>
          <SectionTitle id="ops-sla-title">{t('analytics.operations.sla.title')}</SectionTitle>
        </SectionHeader>

        <Bar
          data={slaConfig.data as Parameters<typeof Bar>[0]['data']}
          options={slaConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.operations.sla.title')}
        />

        {/* Screen-reader accessible table */}
        <SrOnlyTable>
          <caption>{t('analytics.operations.sla.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.operations.sla.tableMetric')}</th>
              <th scope="col">{t('analytics.operations.sla.tableP50')}</th>
              <th scope="col">{t('analytics.operations.sla.tableP90')}</th>
              <th scope="col">{t('analytics.operations.sla.tableSampleCount')}</th>
            </tr>
          </thead>
          <tbody>
            {SLA_ROW_LABELS.map((label, i) => {
              const metric = slaMetrics[i]
              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{formatSeconds(metric, 'median')}</td>
                  <td>{formatSeconds(metric, 'p90')}</td>
                  <td>{metric !== null ? metric.sampleCount : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </SrOnlyTable>

        {/* Visible SLA summary table */}
        <DataTable>
          <caption>{t('analytics.operations.sla.tableCaption')}</caption>
          <thead>
            <tr>
              <Th scope="col">{t('analytics.operations.sla.tableMetric')}</Th>
              <Th scope="col">{t('analytics.operations.sla.tableP50')}</Th>
              <Th scope="col">{t('analytics.operations.sla.tableP90')}</Th>
              <Th scope="col">{t('analytics.operations.sla.tableSampleCount')}</Th>
            </tr>
          </thead>
          <tbody>
            {SLA_ROW_LABELS.map((label, i) => {
              const metric = slaMetrics[i]
              return (
                <tr key={label}>
                  <Td>{label}</Td>
                  <Td>{formatSeconds(metric, 'median')}</Td>
                  <Td>{formatSeconds(metric, 'p90')}</Td>
                  <Td>{metric !== null ? metric.sampleCount : '—'}</Td>
                </tr>
              )
            })}
          </tbody>
        </DataTable>
      </Section>

      {/* ── Offer Funnel ── */}
      <Section aria-labelledby="ops-offer-title">
        <SectionTitle id="ops-offer-title">{t('analytics.operations.offerFunnel.title')}</SectionTitle>

        <Bar
          data={offerFunnelConfig.data as Parameters<typeof Bar>[0]['data']}
          options={offerFunnelConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.operations.offerFunnel.title')}
        />

        {/* Screen-reader accessible table */}
        <SrOnlyTable>
          <caption>{t('analytics.operations.offerFunnel.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.operations.offerFunnel.tableStage')}</th>
              <th scope="col">{t('analytics.operations.offerFunnel.tableCount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('analytics.operations.offerFunnel.labelOffersMade')}</td>
              <td>{data.offerFunnel.offersMade}</td>
            </tr>
            <tr>
              <td>{t('analytics.operations.offerFunnel.labelAccepted')}</td>
              <td>{data.offerFunnel.accepted}</td>
            </tr>
            <tr>
              <td>{t('analytics.operations.offerFunnel.labelDeclined')}</td>
              <td>{data.offerFunnel.declined}</td>
            </tr>
            <tr>
              <td>{t('analytics.operations.offerFunnel.labelTimeouts')}</td>
              <td>{data.offerFunnel.timeouts}</td>
            </tr>
          </tbody>
        </SrOnlyTable>

        {/* Avg offers stat */}
        <dl>
          <StatCard>
            <StatLabel>{t('analytics.operations.offerFunnel.avgOffersLabel')}</StatLabel>
            <StatValue>{data.offerFunnel.avgOffersPerCompleted.toFixed(2)}</StatValue>
          </StatCard>
        </dl>
      </Section>

      {/* ── Lifecycle Funnel ── */}
      <Section aria-labelledby="ops-lifecycle-title">
        <SectionTitle id="ops-lifecycle-title">{t('analytics.operations.lifecycle.title')}</SectionTitle>

        <Bar
          data={lifecycleConfig.data as Parameters<typeof Bar>[0]['data']}
          options={lifecycleConfig.options as Parameters<typeof Bar>[0]['options']}
          aria-label={t('analytics.operations.lifecycle.title')}
        />

        {/* Screen-reader accessible table */}
        <SrOnlyTable>
          <caption>{t('analytics.operations.lifecycle.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('analytics.operations.lifecycle.tableStage')}</th>
              <th scope="col">{t('analytics.operations.lifecycle.tableCount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>{t('analytics.operations.lifecycle.labelCreated')}</td><td>{data.lifecycle.created}</td></tr>
            <tr><td>{t('analytics.operations.lifecycle.labelAssigned')}</td><td>{data.lifecycle.assigned}</td></tr>
            <tr><td>{t('analytics.operations.lifecycle.labelAccepted')}</td><td>{data.lifecycle.accepted}</td></tr>
            <tr><td>{t('analytics.operations.lifecycle.labelArrived')}</td><td>{data.lifecycle.arrived}</td></tr>
            <tr><td>{t('analytics.operations.lifecycle.labelInProgress')}</td><td>{data.lifecycle.inProgress}</td></tr>
            <tr><td>{t('analytics.operations.lifecycle.labelCompleted')}</td><td>{data.lifecycle.completed}</td></tr>
          </tbody>
        </SrOnlyTable>
      </Section>

      {/* ── Cancellation Breakdown ── */}
      <Section aria-labelledby="ops-cancel-title">
        <SectionTitle id="ops-cancel-title">{t('analytics.operations.cancellations.title')}</SectionTitle>

        <Doughnut
          data={cancellationConfig.data as Parameters<typeof Doughnut>[0]['data']}
          options={cancellationConfig.options as Parameters<typeof Doughnut>[0]['options']}
          aria-label={t('analytics.operations.cancellations.title')}
        />

        {/* Visible cancellation breakdown table */}
        {data.cancellations.byRole.length > 0 && (
          <DataTable>
            <caption>{t('analytics.operations.cancellations.byRoleCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.operations.cancellations.tableRole')}</Th>
                <Th scope="col">{t('analytics.operations.cancellations.tableCount')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.cancellations.byRole.map(r => (
                <tr key={r.role}>
                  <Td>{r.role}</Td>
                  <Td>{r.count}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* By-status-at-cancel table */}
        {data.cancellations.byStatusAtCancel.length > 0 && (
          <DataTable>
            <caption>{t('analytics.operations.cancellations.byStatusCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.operations.cancellations.tableStatus')}</Th>
                <Th scope="col">{t('analytics.operations.cancellations.tableCount')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.cancellations.byStatusAtCancel.map(s => (
                <tr key={s.status}>
                  <Td>{s.status}</Td>
                  <Td>{s.count}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* By-hour table */}
        {data.cancellations.byHour.length > 0 && (
          <DataTable>
            <caption>{t('analytics.operations.cancellations.byHourCaption')}</caption>
            <thead>
              <tr>
                <Th scope="col">{t('analytics.operations.cancellations.tableHour')}</Th>
                <Th scope="col">{t('analytics.operations.cancellations.tableCount')}</Th>
              </tr>
            </thead>
            <tbody>
              {data.cancellations.byHour.map(h => (
                <tr key={h.hour}>
                  <Td>{h.hour}:00</Td>
                  <Td>{h.count}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* No-show share stat */}
        <dl>
          <StatCard>
            <StatLabel>{t('analytics.operations.cancellations.noShowShareLabel')}</StatLabel>
            <StatValue>{Math.round(data.cancellations.noShowShare * 100)} %</StatValue>
          </StatCard>
        </dl>
      </Section>
    </Wrapper>
  )
}

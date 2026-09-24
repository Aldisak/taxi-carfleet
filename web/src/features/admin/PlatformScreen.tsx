import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import {
  Panel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Stat,
  DeskPill,
  DeskButton,
  FilterChip,
  type DeskPillTone,
} from '../../shared/ui/desk'
import { Callout } from '../../shared/ui'
import { useAdminAnalytics } from './useAdminAnalytics'
import { healthBand } from './platform/healthBand'
import { sparklinePoints } from './platform/sparklinePath'
import { buildPlatformCsv } from './platform/platformCsv'
import { downloadCsv } from '../../shared/csv/toCsv'
import type { AdminAnalyticsResponse, FleetHealthRow } from '../../shared/api/client'

// ── Formatting helpers (integer CZK, Prague-local dates — rules/web-react-style) ─

const czk = new Intl.NumberFormat('cs-CZ')
const dateFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const SPARK_W = 140
const SPARK_H = 28

/** Value shown for a KPI whose backing field does not exist yet (see handoff data_gaps). */
const GAP = '—'

/** Local (display-only) period selection. `useAdminAnalytics` takes no period param, so this does not refetch. */
type Period = 'thisMonth' | 'twelveWeeks'

// ── Styled components (desk kit + CSS custom properties) ─────────────────────────

const Page = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`

const Title = styled.h1`
  margin: 0;
  font-size: var(--fs-title);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ChipGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`

const Region = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const RegionTitle = styled.h2`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const TableWrap = styled.div`
  overflow-x: auto;
  padding: 4px;
`

const FleetName = styled.span`
  font-weight: var(--fw-bold);
  color: var(--ink);
`

const Spark = styled.svg`
  display: block;
`

const LegendRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`

const LegendSwatch = styled.span<{ $stroke: string }>`
  display: inline-block;
  width: 14px;
  height: 3px;
  border-radius: var(--r-pill);
  background: ${({ $stroke }) => $stroke};
`

const Message = styled.p`
  margin: 0;
  padding: 16px;
  color: var(--ink-2);
`

/**
 * Maps a server health flag to a DeskPill tone (mirrors AdminFleetsPage.trendTone): growing→success,
 * stable→neutral, declining→warning, inactive→danger.
 */
function trendTone(health: string): DeskPillTone {
  switch (health) {
    case 'growing':
      return 'success'
    case 'declining':
      return 'warning'
    case 'inactive':
      return 'danger'
    case 'stable':
    default:
      return 'neutral'
  }
}

/** Sparkline stroke per the platform rule: growing→accent, declining→danger, else (stable/inactive)→ink-3. */
function sparklineStroke(health: string): string {
  switch (health) {
    case 'growing':
      return 'var(--accent)'
    case 'declining':
      return 'var(--danger)'
    default:
      return 'var(--ink-3)'
  }
}

/**
 * SuperAdmin Platform analytics screen (UC-009 WI-16, restyled onto the desk kit for UC-021 WI-8).
 * A 4×2 KPI `Stat` grid inside the "Souhrn platformy" region, a per-fleet 12-week health `Table`
 * (fleet name, rides, revenue, SMS, credits, a 140×28 SVG sparkline coloured by `healthBand`, and a
 * Trend pill), a sparkline-colour legend, and a CSV export.
 *
 * KPI data mapping (from `useAdminAnalytics` — `{ fleets, totals }`):
 *   activeFleets → totals.totalFleets  ·  ridesThisMonth → totals.totalRidesThisMonth
 *   fleetRevenue → totals.totalRevenueThisMonthCzk  ·  smsCost → Σ fleets[].smsEstimatedCostCzk
 * The four remaining KPIs (drivers online now, map credits, API error rate, avg assignment p50) have
 * NO backing field on the analytics DTO and render an em-dash — reported in the handoff `data_gaps`
 * (never fabricated).
 *
 * The period chips (Tento měsíc · 12 týdnů) are a display-only affordance: `useAdminAnalytics` takes
 * no period parameter, so selecting a chip does not refetch. Privacy: no customer PII (no phone
 * numbers) anywhere on this screen — only aggregates — per the bottom callout.
 *
 * Chunk hygiene: inline SVG sparklines, no Chart.js — keeps /admin out of the FleetAdmin analytics
 * chunk (a react-chartjs-2 import would force an admin→analytics chunk dependency via manualChunks).
 */
export function PlatformScreen() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAdminAnalytics()
  const [period, setPeriod] = useState<Period>('thisMonth')

  function formatLastOrder(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : t('admin.platform.noOrders')
  }

  function smsCostTotal(res: AdminAnalyticsResponse): number {
    return res.fleets.reduce((sum, f) => sum + f.smsEstimatedCostCzk, 0)
  }

  function handleExport() {
    if (!data) return
    const headers = [
      t('admin.platform.columns.fleet'),
      t('admin.platform.columns.ridesThisMonth'),
      t('admin.platform.columns.ridesLastMonth'),
      t('admin.platform.columns.momDelta'),
      t('admin.platform.columns.revenueThisMonth'),
      t('admin.platform.columns.activeDrivers'),
      t('admin.platform.columns.activeCustomers'),
      t('admin.platform.columns.sms'),
      t('admin.platform.columns.smsCost'),
      t('admin.platform.columns.lastOrder'),
      t('admin.platform.columns.health'),
    ]
    const csv = buildPlatformCsv(data.fleets, headers, {
      health: (h) => t(healthBand(h).labelKey),
      lastOrder: formatLastOrder,
    })
    downloadCsv(csv, t('admin.platform.csvFilename'))
  }

  function renderSparkline(row: FleetHealthRow) {
    const points = sparklinePoints(row.sparklineWeeks, SPARK_W, SPARK_H)
    return (
      <Spark
        role="img"
        aria-label={t('admin.platform.sparklineLabel', { name: row.fleetName })}
        width={SPARK_W}
        height={SPARK_H}
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={sparklineStroke(row.health)}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </Spark>
    )
  }

  const legend = (
    <LegendRow>
      <LegendItem>
        <LegendSwatch $stroke="var(--accent)" aria-hidden="true" />
        {t('admin.platform.health.growing')}
      </LegendItem>
      <LegendItem>
        <LegendSwatch $stroke="var(--ink-3)" aria-hidden="true" />
        {t('admin.platform.health.stable')}
      </LegendItem>
      <LegendItem>
        <LegendSwatch $stroke="var(--danger)" aria-hidden="true" />
        {t('admin.platform.health.declining')}
      </LegendItem>
    </LegendRow>
  )

  return (
    <Page>
      <Header>
        <Title>{t('admin.platform.title')}</Title>
        <HeaderActions>
          <ChipGroup role="group" aria-label={t('admin.platform.title')}>
            <FilterChip selected={period === 'thisMonth'} onClick={() => setPeriod('thisMonth')}>
              {t('admin.platform.period.thisMonth')}
            </FilterChip>
            <FilterChip selected={period === 'twelveWeeks'} onClick={() => setPeriod('twelveWeeks')}>
              {t('admin.platform.period.twelveWeeks')}
            </FilterChip>
          </ChipGroup>
          <DeskButton
            variant="secondary"
            onClick={handleExport}
            disabled={!data || data.fleets.length === 0}
          >
            {t('admin.platform.exportCsv')}
          </DeskButton>
        </HeaderActions>
      </Header>

      {/* Inline error keeps last-known data visible (rules/web-realtime.md#last-known-state). */}
      {isError && (
        <Callout tone="danger" role="alert">
          {t('admin.platform.loadFailed')}
        </Callout>
      )}

      {isLoading ? (
        <Message role="status">{t('admin.platform.loading')}</Message>
      ) : !data ? (
        !isError && <Message>{t('admin.platform.empty')}</Message>
      ) : (
        <>
          {/* AC9: region named "Souhrn platformy" wraps the KPI aggregation. */}
          <Region aria-label={t('admin.platform.totals.title')}>
            <RegionTitle>{t('admin.platform.totals.title')}</RegionTitle>
            <KpiGrid>
              <Stat label={t('admin.platform.kpi.activeFleets')} value={czk.format(data.totals.totalFleets)} />
              <Stat
                label={t('admin.platform.kpi.ridesThisMonth')}
                value={czk.format(data.totals.totalRidesThisMonth)}
              />
              <Stat
                label={t('admin.platform.kpi.fleetRevenue')}
                value={`${czk.format(data.totals.totalRevenueThisMonthCzk)} Kč`}
              />
              <Stat label={t('admin.platform.kpi.smsCost')} value={`${czk.format(smsCostTotal(data))} Kč`} />
              <Stat label={t('admin.platform.kpi.driversOnline')} value={GAP} />
              <Stat label={t('admin.platform.kpi.mapCredits')} value={GAP} />
              <Stat label={t('admin.platform.kpi.apiErrorRate')} value={GAP} />
              <Stat label={t('admin.platform.kpi.avgAssignmentP50')} value={GAP} />
            </KpiGrid>
          </Region>

          {data.fleets.length === 0 ? (
            <Message>{t('admin.platform.empty')}</Message>
          ) : (
            <Panel title={t('admin.platform.columns.trend')} right={legend}>
              <TableWrap>
                <Table>
                  <Thead>
                    <Tr>
                      <Th scope="col">{t('admin.platform.columns.fleet')}</Th>
                      <Th scope="col" $num>
                        {t('admin.platform.columns.ridesThisMonth')}
                      </Th>
                      <Th scope="col" $num>
                        {t('admin.platform.columns.revenueThisMonth')}
                      </Th>
                      <Th scope="col" $num>
                        {t('admin.platform.columns.sms')}
                      </Th>
                      <Th scope="col" $num>
                        {t('admin.platform.columns.smsCost')}
                      </Th>
                      <Th scope="col">{t('admin.platform.columns.lastOrder')}</Th>
                      <Th scope="col">{t('admin.platform.columns.trend')}</Th>
                      <Th scope="col">{t('admin.platform.columns.health')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {data.fleets.map((row) => (
                      <Tr key={row.fleetId}>
                        <Td>
                          <FleetName>{row.fleetName}</FleetName>
                        </Td>
                        <Td $num>{czk.format(row.ridesThisMonth)}</Td>
                        <Td $num>{czk.format(row.revenueThisMonthCzk)} Kč</Td>
                        <Td $num>{czk.format(row.smsCount)}</Td>
                        <Td $num>{czk.format(row.smsEstimatedCostCzk)} Kč</Td>
                        <Td>{formatLastOrder(row.lastOrderAt)}</Td>
                        <Td>{renderSparkline(row)}</Td>
                        <Td>
                          <DeskPill tone={trendTone(row.health)}>
                            {t(healthBand(row.health).labelKey)}
                          </DeskPill>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableWrap>
            </Panel>
          )}

          <Callout tone="neutral">{t('admin.platform.privacyNote')}</Callout>
        </>
      )}
    </Page>
  )
}

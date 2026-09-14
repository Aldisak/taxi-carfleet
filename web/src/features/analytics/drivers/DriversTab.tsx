import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Line } from 'react-chartjs-2'
import '../charts/registerCharts'
import { useAnalyticsDrivers } from '../useAnalyticsDrivers'
import { DriverDrilldown } from './DriverDrilldown'
import { sortLeague } from './leagueSort'
import { buildLeagueTableCsv } from './driversCsv'
import { buildRetentionLineConfig } from './driversCharts'
import { downloadCsv } from '../../../shared/csv/toCsv'
import type { AnalyticsDriversParams, DriverLeagueRowDto } from '../../../shared/api/client'
import type { LeagueSortKey, SortDirection } from './leagueSort'

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
  padding: 0;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  white-space: nowrap;
`

const SortButton = styled.button`
  all: unset;
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  color: inherit;
  font: inherit;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
`

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const DriverNameCell = styled.td`
  padding: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const DriverNameButton = styled.button`
  all: unset;
  display: block;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
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

interface DriversTabProps {
  params: AnalyticsDriversParams
}

// ── Component ─────────────────────────────────────────────────────────────────

/** The Řidiči analytics tab: league table with sort + CSV export, and driver retention chart. */
export function DriversTab({ params }: DriversTabProps) {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAnalyticsDrivers(params)

  const [sortKey, setSortKey] = useState<LeagueSortKey>('ridesCompleted')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [selectedDriver, setSelectedDriver] = useState<{ id: string; name: string } | null>(null)

  const leagueId = 'drivers-league-title'
  const retentionId = 'drivers-retention-title'

  function handleSort(key: LeagueSortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function handleDriverClick(driver: DriverLeagueRowDto) {
    setSelectedDriver({ id: driver.driverId, name: driver.name })
  }

  function handleExportCsv() {
    if (!data) return
    const sorted = sortLeague(data.drivers, sortKey, sortDir)
    const csv = buildLeagueTableCsv(sorted)
    downloadCsv(csv, 'ridici-liga.csv')
  }

  // Show drill-down if a driver is selected
  if (selectedDriver) {
    return (
      <DriverDrilldown
        driverId={selectedDriver.id}
        driverName={selectedDriver.name}
        params={params}
        onBack={() => setSelectedDriver(null)}
      />
    )
  }

  if (isLoading) return <LoadingMessage>{t('analytics.drivers.loading')}</LoadingMessage>
  if (isError || !data) return <ErrorMessage>{t('analytics.drivers.error')}</ErrorMessage>

  const sorted = sortLeague(data.drivers, sortKey, sortDir)
  const retentionConfig = buildRetentionLineConfig(
    data.retention,
    t('analytics.drivers.retention.activeLabel'),
    t('analytics.drivers.retention.newLabel'),
    t('analytics.drivers.retention.churnedLabel'),
  )

  return (
    <Wrapper>
      {/* League table */}
      <Section aria-labelledby={leagueId}>
        <SectionHeader>
          <SectionTitle id={leagueId}>{t('analytics.drivers.league.title')}</SectionTitle>
          <ExportButton type="button" onClick={handleExportCsv}>
            {t('analytics.drivers.league.csvLabel')}
          </ExportButton>
        </SectionHeader>

        <DataTable>
          <caption>{t('analytics.drivers.league.tableCaption')}</caption>
          <thead>
            <tr>
              <Th
                scope="col"
                aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('name')}>
                  {t('analytics.drivers.league.tableDriver')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'ridesCompleted' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('ridesCompleted')}>
                  {t('analytics.drivers.league.tableRides')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'revenueCzk' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('revenueCzk')}>
                  {t('analytics.drivers.league.tableRevenue')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'onlineHours' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('onlineHours')}>
                  {t('analytics.drivers.league.tableOnline')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'utilizationPct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('utilizationPct')}>
                  {t('analytics.drivers.league.tableUtil')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'acceptanceRate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('acceptanceRate')}>
                  {t('analytics.drivers.league.tableAcceptance')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'declinesAndTimeouts' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('declinesAndTimeouts')}>
                  {t('analytics.drivers.league.tableDeclines')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'cancellations' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('cancellations')}>
                  {t('analytics.drivers.league.tableCancellations')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'noShows' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('noShows')}>
                  {t('analytics.drivers.league.tableNoShows')}
                </SortButton>
              </Th>
              <Th
                scope="col"
                aria-sort={sortKey === 'avgRating' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <SortButton type="button" onClick={() => handleSort('avgRating')}>
                  {t('analytics.drivers.league.tableRating')}
                </SortButton>
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(driver => (
              <tr key={driver.driverId}>
                <DriverNameCell>
                  <DriverNameButton type="button" onClick={() => handleDriverClick(driver)}>
                    {driver.name}
                  </DriverNameButton>
                </DriverNameCell>
                <Td>{driver.ridesCompleted}</Td>
                <Td>{driver.revenueCzk}</Td>
                <Td>{driver.onlineHours.toFixed(1)}</Td>
                <Td>{driver.utilizationPct.toFixed(0)}</Td>
                <Td>{driver.acceptanceRate.toFixed(0)}</Td>
                <Td>{driver.declinesAndTimeouts}</Td>
                <Td>{driver.cancellations}</Td>
                <Td>{driver.noShows}</Td>
                <Td>{driver.avgRating !== null ? driver.avgRating.toFixed(1) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>

      {/* Retention chart */}
      {data.retention.length > 0 && (
        <Section aria-labelledby={retentionId}>
          <SectionTitle id={retentionId}>{t('analytics.drivers.retention.title')}</SectionTitle>
          <Line
            data={retentionConfig.data as Parameters<typeof Line>[0]['data']}
            options={retentionConfig.options as Parameters<typeof Line>[0]['options']}
            aria-label={t('analytics.drivers.retention.title')}
          />
          <SrOnlyTable>
            <caption>{t('analytics.drivers.retention.tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('analytics.drivers.retention.tableWeek')}</th>
                <th scope="col">{t('analytics.drivers.retention.tableActive')}</th>
                <th scope="col">{t('analytics.drivers.retention.tableNew')}</th>
                <th scope="col">{t('analytics.drivers.retention.tableChurned')}</th>
              </tr>
            </thead>
            <tbody>
              {data.retention.map(row => (
                <tr key={row.weekStart}>
                  <td>{row.weekStart}</td>
                  <td>{row.active}</td>
                  <td>{row.newlyActivated}</td>
                  <td>{row.churned}</td>
                </tr>
              ))}
            </tbody>
          </SrOnlyTable>
        </Section>
      )}
    </Wrapper>
  )
}

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { useAdminAnalytics } from './useAdminAnalytics'
import { healthBand } from './platform/healthBand'
import { sparklinePoints } from './platform/sparklinePath'
import { buildPlatformCsv } from './platform/platformCsv'
import { downloadCsv } from '../../shared/csv/toCsv'
import { theme } from '../../shared/theme/theme'
import type { FleetHealthRow } from '../../shared/api/client'

// ── Formatting helpers (integer CZK, Prague-local dates — rules/web-react-style) ─

const czk = new Intl.NumberFormat('cs-CZ')
const dateFmt = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: 'Europe/Prague',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const SPARK_W = 96
const SPARK_H = 24

// ── Styled components ───────────────────────────────────────────────────────────

const Page = styled.main`
  max-width: 1200px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Titles = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const SubTitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`

const BackLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: inline-flex;
  align-items: center;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const ExportButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const Message = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: ${({ theme }) => theme.spacing.lg};
`

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error};
  background: ${({ theme }) => theme.colors.error}11;
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  margin: 0;
`

const TableWrap = styled.div`
  overflow-x: auto;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Th = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  white-space: nowrap;
`

const Td = styled.td`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
`

const TotalsTd = styled(Td)`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  border-top: 2px solid ${({ theme }) => theme.colors.border};
`

const HealthChip = styled.span<{ $bg: string; $fg: string }>`
  display: inline-block;
  padding: 2px ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ $fg }) => $fg};
  background: ${({ $bg }) => $bg};
`

const TotalsSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const TotalsTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const TotalsGrid = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin: 0;
`

const TotalCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const TotalLabel = styled.dt`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const TotalValue = styled.dd`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
`

const Spark = styled.svg`
  display: block;
`

const SrCaption = styled.caption`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

/**
 * SuperAdmin Platform analytics screen (UC-009 WI-16). Renders the cross-tenant
 * per-fleet health table (rides MoM, revenue, active drivers/customers, SMS cost,
 * last order, server-computed health flag) plus 12-week rides SVG sparklines and a
 * platform totals row, with a CSV export.
 *
 * Chunk hygiene: this screen deliberately uses an inline SVG sparkline rather than
 * Chart.js. Importing react-chartjs-2 here would force an admin→analytics chunk
 * dependency via vite `manualChunks`, dragging the ~95 KB FleetAdmin analytics chunk
 * into the SuperAdmin admin chunk. The SVG keeps /admin lean and chart-free.
 *
 * Reachability caveat (mirrors AdminFleetsPage): reaching /admin needs a SuperAdmin
 * JWT the backend cannot mint today (no SuperAdmin login path). The screen is
 * otherwise complete.
 */
export function PlatformScreen() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useAdminAnalytics()

  function formatLastOrder(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : t('admin.platform.noOrders')
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
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </Spark>
    )
  }

  return (
    <Page>
      <Header>
        <Titles>
          <Title>{t('admin.platform.title')}</Title>
          <SubTitle>{t('admin.platform.subtitle')}</SubTitle>
        </Titles>
        <Actions>
          <BackLink to="/admin">{t('admin.platform.backToFleets')}</BackLink>
          <ExportButton type="button" onClick={handleExport} disabled={!data || data.fleets.length === 0}>
            {t('admin.platform.exportCsv')}
          </ExportButton>
        </Actions>
      </Header>

      {/* Inline error keeps last-known data visible (rules/web-realtime.md#last-known-state). */}
      {isError && <ErrorText role="alert">{t('admin.platform.loadFailed')}</ErrorText>}

      {isLoading ? (
        <Message>{t('admin.platform.loading')}</Message>
      ) : !data ? (
        // Only when there is no last-known data at all (first-load failure).
        !isError && <Message>{t('admin.platform.empty')}</Message>
      ) : data.fleets.length === 0 ? (
        <Message>{t('admin.platform.empty')}</Message>
      ) : (
        <>
          <TableWrap>
            <Table>
              <SrCaption>{t('admin.platform.title')}</SrCaption>
              <thead>
                <tr>
                  <Th scope="col">{t('admin.platform.columns.fleet')}</Th>
                  <Th scope="col">{t('admin.platform.columns.ridesThisMonth')}</Th>
                  <Th scope="col">{t('admin.platform.columns.ridesLastMonth')}</Th>
                  <Th scope="col">{t('admin.platform.columns.momDelta')}</Th>
                  <Th scope="col">{t('admin.platform.columns.revenueThisMonth')}</Th>
                  <Th scope="col">{t('admin.platform.columns.activeDrivers')}</Th>
                  <Th scope="col">{t('admin.platform.columns.activeCustomers')}</Th>
                  <Th scope="col">{t('admin.platform.columns.sms')}</Th>
                  <Th scope="col">{t('admin.platform.columns.smsCost')}</Th>
                  <Th scope="col">{t('admin.platform.columns.lastOrder')}</Th>
                  <Th scope="col">{t('admin.platform.columns.trend')}</Th>
                  <Th scope="col">{t('admin.platform.columns.health')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.fleets.map((row) => {
                  const band = healthBand(row.health)
                  return (
                    <tr key={row.fleetId}>
                      <Td>{row.fleetName}</Td>
                      <Td>{czk.format(row.ridesThisMonth)}</Td>
                      <Td>{czk.format(row.ridesLastMonth)}</Td>
                      <Td>{row.momDeltaPct} %</Td>
                      <Td>{czk.format(row.revenueThisMonthCzk)} Kč</Td>
                      <Td>{czk.format(row.activeDrivers)}</Td>
                      <Td>{czk.format(row.activeCustomers)}</Td>
                      <Td>{czk.format(row.smsCount)}</Td>
                      <Td>{czk.format(row.smsEstimatedCostCzk)} Kč</Td>
                      <Td>{formatLastOrder(row.lastOrderAt)}</Td>
                      <Td>{renderSparkline(row)}</Td>
                      <Td>
                        <HealthChip $bg={theme.colors[band.colorToken]} $fg={theme.colors[band.fgToken]}>
                          {t(band.labelKey)}
                        </HealthChip>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <TotalsTd>{t('admin.platform.totals.fleets')}</TotalsTd>
                  <TotalsTd>{czk.format(data.totals.totalRidesThisMonth)}</TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd>{czk.format(data.totals.totalRevenueThisMonthCzk)} Kč</TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd aria-hidden="true"></TotalsTd>
                  <TotalsTd>{czk.format(data.totals.totalFleets)}</TotalsTd>
                </tr>
              </tfoot>
            </Table>
          </TableWrap>

          <TotalsSection aria-label={t('admin.platform.totals.title')}>
            <TotalsTitle>{t('admin.platform.totals.title')}</TotalsTitle>
            <TotalsGrid>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.fleets')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.totalFleets)}</TotalValue>
              </TotalCard>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.rides')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.totalRidesThisMonth)}</TotalValue>
              </TotalCard>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.revenue')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.totalRevenueThisMonthCzk)} Kč</TotalValue>
              </TotalCard>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.growing')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.growingFleets)}</TotalValue>
              </TotalCard>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.declining')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.decliningFleets)}</TotalValue>
              </TotalCard>
              <TotalCard as="div">
                <TotalLabel>{t('admin.platform.totals.inactive')}</TotalLabel>
                <TotalValue>{czk.format(data.totals.inactiveFleets)}</TotalValue>
              </TotalCard>
            </TotalsGrid>
          </TotalsSection>
        </>
      )}
    </Page>
  )
}

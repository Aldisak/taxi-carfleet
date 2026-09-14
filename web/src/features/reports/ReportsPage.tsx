import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { authStorage } from '../../shared/api/auth-storage'
import { canAccessSettings } from '../settings/roleGating'
import { getDrivers } from '../../shared/api/client'
import { defaultThisMonthRange } from './reportDateRange'
import { useDriverReport, useFleetReport, useRatings, downloadDriverReportCsv } from './useReports'
import { DriverReportTable } from './DriverReportTable'
import { FleetKpiCards } from './FleetKpiCards'
import { RidesChart } from './RidesChart'
import { RatingsList } from './RatingsList'

const Page = styled.div`
  height: 100%;
  overflow: auto;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xl};
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const SectionTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  color: ${({ theme }) => theme.colors.text};
`

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${({ theme }) => theme.spacing.md};
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Select = styled.select`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Button = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`

const TopRoutesList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const TopRouteRow = styled.li`
  display: flex;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme }) => theme.colors.text};
`

const StatusText = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
`

const AccessDenied = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** /dispatcher/reports — FleetAdmin reports screen (driver report + fleet report + ratings). */
export function ReportsPage() {
  const { t } = useTranslation()
  const role = authStorage.getUserRole()

  const defaultRange = useMemo(() => defaultThisMonthRange(new Date()), [])
  const [driverId, setDriverId] = useState<string>('')
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [downloading, setDownloading] = useState(false)

  const driverFilters = { driverId: driverId || null, from, to }
  const fleetFilters = { from, to }

  const driversQuery = useQuery({ queryKey: ['drivers'], queryFn: getDrivers, staleTime: 60_000 })
  // The driver report requires a selected driver (backend NotEmpty → 400 on Guid.Empty), so the
  // query only fires once a driver is chosen; otherwise the section shows a pick-a-driver hint.
  const driverReport = useDriverReport(driverFilters, driverId !== '')
  const fleetReport = useFleetReport(fleetFilters)
  const ratings = useRatings()

  if (!canAccessSettings(role)) {
    return <AccessDenied role="alert">{t('reports.accessDenied')}</AccessDenied>
  }

  async function handleDownloadCsv() {
    setDownloading(true)
    try {
      await downloadDriverReportCsv(driverFilters)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Page>
      <h1>{t('reports.title')}</h1>

      <Filters>
        <Field>
          {t('reports.driverReport.driver')}
          <Select
            value={driverId}
            onChange={e => setDriverId(e.target.value)}
            aria-label={t('reports.driverReport.driver')}
          >
            <option value="">{t('reports.driverReport.allDrivers')}</option>
            {driversQuery.data?.items.map(d => (
              <option key={d.driverId} value={d.driverId}>
                {d.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          {t('reports.driverReport.from')}
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </Field>
        <Field>
          {t('reports.driverReport.to')}
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </Field>
        <Button type="button" onClick={handleDownloadCsv} disabled={downloading}>
          {downloading ? t('reports.driverReport.downloading') : t('reports.driverReport.downloadCsv')}
        </Button>
      </Filters>

      <Section aria-labelledby="driver-report-title">
        <SectionTitle id="driver-report-title">{t('reports.driverReport.title')}</SectionTitle>
        {driverId === '' && <StatusText>{t('reports.driverReport.selectDriver')}</StatusText>}
        {driverId !== '' && driverReport.isPending && <StatusText>{t('reports.loading')}</StatusText>}
        {driverId !== '' && driverReport.isError && <StatusText role="alert">{t('reports.error')}</StatusText>}
        {driverId !== '' && driverReport.data && <DriverReportTable report={driverReport.data} />}
      </Section>

      <Section aria-labelledby="fleet-report-title">
        <SectionTitle id="fleet-report-title">{t('reports.fleet.title')}</SectionTitle>
        {fleetReport.isPending && <StatusText>{t('reports.loading')}</StatusText>}
        {fleetReport.isError && <StatusText role="alert">{t('reports.error')}</StatusText>}
        {fleetReport.data && (
          <>
            <FleetKpiCards kpis={fleetReport.data.kpis} />
            <RidesChart data={fleetReport.data.ridesPerDay} />
            <div>
              <SectionTitle as="h3">{t('reports.topRoutes.title')}</SectionTitle>
              {fleetReport.data.topRoutes.length === 0 ? (
                <StatusText>{t('reports.topRoutes.empty')}</StatusText>
              ) : (
                <TopRoutesList>
                  {fleetReport.data.topRoutes.map(route => (
                    <TopRouteRow key={route.routeId}>
                      <span>{route.name}</span>
                      <span>{t('reports.topRoutes.count', { count: route.count })}</span>
                    </TopRouteRow>
                  ))}
                </TopRoutesList>
              )}
            </div>
          </>
        )}
      </Section>

      <Section aria-labelledby="ratings-title">
        <SectionTitle id="ratings-title">{t('reports.ratings.title')}</SectionTitle>
        {ratings.isPending && <StatusText>{t('reports.loading')}</StatusText>}
        {ratings.isError && <StatusText role="alert">{t('reports.error')}</StatusText>}
        {ratings.data && <RatingsList ratings={ratings.data} />}
      </Section>
    </Page>
  )
}

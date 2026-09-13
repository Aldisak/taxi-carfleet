import { useQuery } from '@tanstack/react-query'
import {
  getDriverReport,
  getFleetReport,
  getRatings,
  fetchDriverReportCsv,
  type DriverReportFilters,
  type FleetReportFilters,
} from '../../shared/api/client'
import { downloadBlob, driverReportCsvFilename } from './csvDownload'

/**
 * Driver report query. Hierarchical key includes the filters (rules/web-performance.md#query-keys).
 * `enabled` gates the fetch — the backend requires a non-empty driverId (NotEmpty → 400), so the
 * caller only enables the query once a driver is selected.
 */
export function useDriverReport(filters: DriverReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'drivers', filters],
    queryFn: () => getDriverReport(filters),
    staleTime: 60_000,
    enabled,
  })
}

/** Fleet report query (KPIs + rides-per-day + top routes). */
export function useFleetReport(filters: FleetReportFilters) {
  return useQuery({
    queryKey: ['reports', 'fleet', filters],
    queryFn: () => getFleetReport(filters),
    staleTime: 60_000,
  })
}

/** Ratings list query. Rangeless — the backend returns all rated orders, newest first. */
export function useRatings() {
  return useQuery({
    queryKey: ['reports', 'ratings'],
    queryFn: () => getRatings(),
    staleTime: 60_000,
  })
}

/**
 * Fetches the server-generated driver-report CSV blob and triggers a browser download.
 * The server owns the CSV bytes (AC#7); this only wires fetch → download.
 */
export async function downloadDriverReportCsv(filters: DriverReportFilters): Promise<void> {
  const { blob, filename } = await fetchDriverReportCsv(filters)
  downloadBlob(blob, driverReportCsvFilename(filename, filters.from, filters.to))
}

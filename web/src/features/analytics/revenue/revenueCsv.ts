/**
 * CSV builders for the Revenue (Tržby) analytics tab.
 *
 * All outputs: UTF-8 BOM + ';'-delimited + CRLF — opens correctly in Czech Excel.
 */

import { toCsv } from '../../../shared/csv/toCsv'
import type { RevenueTopRouteDto, ZoneRevenueDto } from '../../../shared/api/client'

/**
 * Builds a top-routes CSV for revenue analytics.
 * Columns: Odkud ; Kam ; Jízdy ; Tržby (Kč) ; AOV (Kč)
 */
export function buildRevenueTopRoutesCsv(routes: RevenueTopRouteDto[]): string {
  const headers = ['Odkud', 'Kam', 'Jízdy', 'Tržby (Kč)', 'AOV (Kč)']
  const rows: string[][] = routes.map(r => [
    r.pickupAddress,
    r.dropoffAddress,
    String(r.rides),
    String(r.revenueCzk),
    String(r.aovCzk),
  ])
  return toCsv(headers, rows)
}

/**
 * Builds a zone-revenue CSV for revenue analytics.
 * Columns: Zóna ; Jízdy ; Tržby (Kč) ; AOV (Kč)
 */
export function buildZoneRevenueCsv(zones: ZoneRevenueDto[]): string {
  const headers = ['Zóna', 'Jízdy', 'Tržby (Kč)', 'AOV (Kč)']
  const rows: string[][] = zones.map(z => [
    z.zoneName,
    String(z.rides),
    String(z.revenueCzk),
    String(z.aovCzk),
  ])
  return toCsv(headers, rows)
}

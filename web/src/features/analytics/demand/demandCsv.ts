/**
 * CSV builders for the Demand analytics tab.
 *
 * All outputs: UTF-8 BOM + ';'-delimited + CRLF — opens correctly in Czech Excel.
 *
 * DOW convention: 0=Sunday … 6=Saturday (Postgres EXTRACT(DOW)).
 */

import { toCsv } from '../../../shared/csv/toCsv'
import type { HeatmapCellDto, ZonePickupDto, DemandTopRouteDto } from '../../../shared/api/client'

/** Czech abbreviated DOW labels indexed by DOW (0=Sun … 6=Sat). */
const DOW_LABELS_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']

/**
 * Builds a heatmap CSV: rows = hours (0–23), columns = DOW days.
 * Header: Hodina ; Ne ; Po ; Út ; St ; Čt ; Pá ; So
 */
export function buildHeatmapCsv(cells: HeatmapCellDto[]): string {
  // Build a 24×7 matrix indexed by [hour][dow]
  const matrix: number[][] = Array.from({ length: 24 }, () => new Array<number>(7).fill(0))

  for (const cell of cells) {
    if (cell.hour >= 0 && cell.hour <= 23 && cell.dow >= 0 && cell.dow <= 6) {
      matrix[cell.hour][cell.dow] = cell.count
    }
  }

  const headers = ['Hodina', ...DOW_LABELS_CS]
  const rows: string[][] = Array.from({ length: 24 }, (_, hour) => [
    `${hour}:00`,
    ...DOW_LABELS_CS.map((_, dow) => String(matrix[hour][dow])),
  ])

  return toCsv(headers, rows)
}

/**
 * Builds a zone-pickups CSV: rows = zones, columns = Zóna + Vyzvednutí.
 */
export function buildZonePickupsCsv(zones: ZonePickupDto[]): string {
  const headers = ['Zóna', 'Vyzvednutí']
  const rows: string[][] = zones.map(z => [z.zoneName, String(z.pickupCount)])
  return toCsv(headers, rows)
}

/**
 * Builds a top-routes CSV: rows = routes, columns = Odkud + Kam + Počet.
 */
export function buildTopRoutesCsv(routes: DemandTopRouteDto[]): string {
  const headers = ['Odkud', 'Kam', 'Počet']
  const rows: string[][] = routes.map(r => [r.pickupAddress, r.dropoffAddress, String(r.count)])
  return toCsv(headers, rows)
}

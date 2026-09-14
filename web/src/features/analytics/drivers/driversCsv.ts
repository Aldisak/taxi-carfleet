/**
 * CSV builders for the Drivers (Řidiči) analytics tab.
 *
 * All outputs: UTF-8 BOM + ';'-delimited + CRLF — opens correctly in Czech Excel.
 */

import { toCsv } from '../../../shared/csv/toCsv'
import type { DriverLeagueRowDto } from '../../../shared/api/client'

/**
 * Builds a league table CSV for the drivers analytics tab.
 * Columns: Řidič ; Jízdy ; Tržby (Kč) ; Online (hod.) ; Vytíženost (%) ;
 *          Tržby/hod. ; Přijetí (%) ; Odmítnutí ; Storna ; No-show ; Hodnocení
 */
export function buildLeagueTableCsv(rows: DriverLeagueRowDto[]): string {
  const headers = [
    'Řidič',
    'Jízdy',
    'Tržby (Kč)',
    'Online (hod.)',
    'Vytíženost (%)',
    'Tržby/hod.',
    'Přijetí (%)',
    'Odmítnutí',
    'Storna',
    'No-show',
    'Hodnocení',
  ]

  const data: string[][] = rows.map(r => [
    r.name,
    String(r.ridesCompleted),
    String(r.revenueCzk),
    String(r.onlineHours),
    String(r.utilizationPct),
    String(Math.round(r.revenuePerOnlineHour)),
    String(r.acceptanceRate),
    String(r.declinesAndTimeouts),
    String(r.cancellations),
    String(r.noShows),
    r.avgRating !== null ? String(r.avgRating) : '',
  ])

  return toCsv(headers, data)
}

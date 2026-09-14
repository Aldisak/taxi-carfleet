/**
 * Pure CSV builder for the SuperAdmin Platform health table.
 *
 * Reuses the shared `toCsv` builder (BOM + ';' + CRLF + RFC-4180 escaping) so the
 * export opens in Czech Excel (AC#7). Money columns are emitted as RAW integer CZK
 * (no thousands separators) — display formatting is a render concern; a CSV must
 * carry machine-readable numbers.
 */

import { toCsv } from '../../../shared/csv/toCsv'
import type { FleetHealthRow } from '../../../shared/api/client'

/** Cell formatters injected by the caller (i18n-dependent, so not hardcoded here). */
export interface PlatformCsvFormatters {
  /** Maps a health flag string to a human-readable label. */
  health: (health: string) => string
  /** Maps a nullable UTC ISO timestamp to a display string. */
  lastOrder: (iso: string | null) => string
}

/**
 * Builds the platform health-table CSV string.
 *
 * @param rows - Per-fleet health rows.
 * @param headers - Translated column headers (order must match the row builder below).
 * @param fmt - i18n-dependent cell formatters (health label, last-order date).
 * @returns A BOM-prefixed, ';'-delimited, CRLF CSV string.
 */
export function buildPlatformCsv(
  rows: FleetHealthRow[],
  headers: string[],
  fmt: PlatformCsvFormatters,
): string {
  const dataRows = rows.map((r) => [
    r.fleetName,
    String(r.ridesThisMonth),
    String(r.ridesLastMonth),
    String(r.momDeltaPct),
    String(r.revenueThisMonthCzk),
    String(r.activeDrivers),
    String(r.activeCustomers),
    String(r.smsCount),
    String(r.smsEstimatedCostCzk),
    fmt.lastOrder(r.lastOrderAt),
    fmt.health(r.health),
  ])

  return toCsv(headers, dataRows)
}

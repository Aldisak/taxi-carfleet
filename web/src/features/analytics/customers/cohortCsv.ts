/**
 * CSV builder for the customer cohort retention triangle.
 *
 * Pivots the backend row-per-(acqMonth, monthsSince) shape into a
 * spreadsheet-friendly triangle: one row per acquisition month,
 * one column per months-since value.
 *
 * Output: UTF-8 BOM + ';'-delimited + CRLF — opens correctly in Czech Excel.
 */

import { toCsv } from '../../../shared/csv/toCsv'
import type { CustomerCohortRowDto } from '../../../shared/api/client'

/**
 * Builds a pivoted cohort retention triangle CSV.
 *
 * Header: Kohorta ; Měsíc 0 ; Měsíc 1 ; … ; Měsíc N
 * Data: one row per acquisition month (acqMonthLabel), columns = activeCustomers per monthsSince.
 */
export function buildCohortCsv(rows: CustomerCohortRowDto[]): string {
  if (rows.length === 0) {
    return toCsv(['Kohorta'], [])
  }

  // Determine the set of unique monthsSince values (sorted ascending)
  const monthsSinceValues = [...new Set(rows.map(r => r.monthsSince))].sort((a, b) => a - b)

  // Determine the ordered set of unique acquisition months (stable insertion order)
  const acqMonths: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!seen.has(row.acqMonthLabel)) {
      seen.add(row.acqMonthLabel)
      acqMonths.push(row.acqMonthLabel)
    }
  }

  // Build a lookup map: (acqMonthLabel, monthsSince) → activeCustomers
  const lookup = new Map<string, number>()
  for (const row of rows) {
    lookup.set(`${row.acqMonthLabel}|${row.monthsSince}`, row.activeCustomers)
  }

  const headers = ['Kohorta', ...monthsSinceValues.map(m => `Měsíc ${m}`)]

  const data: string[][] = acqMonths.map(acq => [
    acq,
    ...monthsSinceValues.map(m => {
      const val = lookup.get(`${acq}|${m}`)
      return val !== undefined ? String(val) : ''
    }),
  ])

  return toCsv(headers, data)
}

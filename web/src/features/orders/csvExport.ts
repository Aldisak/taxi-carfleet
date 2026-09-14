/** A flat row shape derived from OrderSummaryDto for CSV export. */
export interface CsvOrderRow {
  publicCode: string
  createdAt: string
  scheduledAt: string | null
  customerPhone: string
  customerName: string | null
  pickupAddress: string
  dropoffAddress: string | null
  estimatedPriceCzk: number | null
  fixedPriceCzk: number | null
  driverName: string | null
  status: string
}

const HEADERS = [
  'Kód',
  'Vytvořeno',
  'Kdy',
  'Telefon',
  'Jméno',
  'Nástup',
  'Cíl',
  'Cena (Kč)',
  'Řidič',
  'Stav',
]

/** Escapes a single CSV field value per RFC 4180 (semicolon delimiter). */
function escapeField(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Formats a nullable ISO timestamp for display. */
function formatTimestamp(isoStr: string | null): string {
  if (!isoStr) return 'ASAP'
  const d = new Date(isoStr)
  return d.toLocaleString('cs-CZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Returns the effective price as a string or empty. */
function formatPrice(row: CsvOrderRow): string {
  const price = row.fixedPriceCzk ?? row.estimatedPriceCzk
  return price != null ? String(price) : ''
}

/** Converts an array of order rows to a UTF-8 BOM + CRLF CSV string. */
export function exportOrdersToCsv(rows: CsvOrderRow[]): string {
  const BOM = '﻿'
  const CRLF = '\r\n'
  const DELIM = ';'

  const lines: string[] = []

  // Header
  lines.push(HEADERS.map(escapeField).join(DELIM))

  // Data rows
  for (const row of rows) {
    const fields = [
      row.publicCode,
      formatTimestamp(row.createdAt),
      row.scheduledAt ? formatTimestamp(row.scheduledAt) : 'ASAP',
      row.customerPhone,
      row.customerName ?? '',
      row.pickupAddress,
      row.dropoffAddress ?? '',
      formatPrice(row),
      row.driverName ?? '',
      row.status,
    ]
    lines.push(fields.map(escapeField).join(DELIM))
  }

  return BOM + lines.join(CRLF) + CRLF
}

/** Generates a filename like `objednavky-2026-09-12.csv` using the local date. */
export function getCsvFilename(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `objednavky-${y}-${m}-${day}.csv`
}

/**
 * Triggers a client-side file download for the given CSV string.
 * Re-exported from `src/shared/csv/toCsv.ts` (promoted in WI-11).
 */
export { downloadCsv } from '../../shared/csv/toCsv'

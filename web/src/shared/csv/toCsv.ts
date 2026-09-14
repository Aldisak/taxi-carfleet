/**
 * Generic client-side CSV builder.
 *
 * Produces a UTF-8 BOM + semicolon-delimited + CRLF CSV string suitable for
 * opening in Czech Excel (Excel on cs-CZ locale defaults to ';' as the list separator).
 * Escaping follows RFC 4180: fields containing ';', '"', '\n', or '\r' are quoted;
 * internal '"' characters are doubled.
 */

/** Escapes a single CSV field value per RFC 4180 (semicolon delimiter). */
function escapeField(value: string): string {
  if (
    value.includes(';') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Builds a UTF-8 BOM + ';'-delimited + CRLF CSV string.
 *
 * @param headers - Column header strings (first row).
 * @param rows - Data rows; each cell is coerced to string (`null`/`undefined` → empty string).
 * @returns A CSV string starting with `﻿` and ending with `\r\n`.
 */
export function toCsv(headers: string[], rows: string[][]): string {
  const BOM = '﻿'
  const CRLF = '\r\n'
  const DELIM = ';'

  const lines: string[] = []

  lines.push(headers.map(escapeField).join(DELIM))

  for (const row of rows) {
    const fields = row.map(cell => {
      const str = cell == null ? '' : String(cell)
      return escapeField(str)
    })
    lines.push(fields.join(DELIM))
  }

  return BOM + lines.join(CRLF) + CRLF
}

/**
 * Triggers a client-side file download for the given CSV string.
 *
 * @param csvContent - The full CSV string (including BOM).
 * @param filename - The suggested download filename.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Pure-ish blob download trigger for the server-generated driver-report CSV.
 *
 * The CSV bytes are produced BY the server (UTF-8 BOM + ';' separator, AC#7) — this
 * module never builds CSV content. It only turns a fetched Blob into a browser
 * download via a transient <a download> (mirrors downloadCsv in orders/csvExport.ts).
 */

/** Triggers a browser file download for the given blob under the given filename. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Returns a filename for the driver-report CSV. Prefers the server-provided
 * Content-Disposition filename; falls back to a Czech-friendly name derived from the range.
 */
export function driverReportCsvFilename(serverFilename: string | null, from: string, to: string): string {
  if (serverFilename && serverFilename.trim().length > 0) return serverFilename
  return `report-ridicu-${from}_${to}.csv`
}

import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadBlob, driverReportCsvFilename } from './csvDownload'

describe('driverReportCsvFilename', () => {
  it('prefers the server-provided filename', () => {
    expect(driverReportCsvFilename('report-KH-2026-09.csv', '2026-09-01', '2026-09-30')).toBe('report-KH-2026-09.csv')
  })

  it('falls back to a range-derived Czech filename when the server gives none', () => {
    expect(driverReportCsvFilename(null, '2026-09-01', '2026-09-30')).toBe('report-ridicu-2026-09-01_2026-09-30.csv')
    expect(driverReportCsvFilename('   ', '2026-09-01', '2026-09-30')).toBe('report-ridicu-2026-09-01_2026-09-30.csv')
  })
})

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL, clicks a transient anchor, and revokes the URL', () => {
    const createUrl = vi.fn().mockReturnValue('blob:mock')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const blob = new Blob(['a;b;c'], { type: 'text/csv' })
    downloadBlob(blob, 'x.csv')

    expect(createUrl).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock')
    // The anchor is removed after the click — nothing left in the DOM.
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

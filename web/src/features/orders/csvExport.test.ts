import { describe, expect, it } from 'vitest'
import { exportOrdersToCsv, getCsvFilename, type CsvOrderRow } from './csvExport'

/** Minimal helper to strip the UTF-8 BOM prefix. */
function stripBom(s: string): string {
  return s.startsWith('﻿') ? s.slice(1) : s
}

const SAMPLE_ROWS: CsvOrderRow[] = [
  {
    publicCode: 'KL-0001',
    createdAt: '2026-09-12T10:00:00.000Z',
    scheduledAt: null,
    customerPhone: '+420777123456',
    customerName: 'Jan Novák',
    pickupAddress: 'Nádraží Kolín',
    dropoffAddress: 'Nemocnice Kolín',
    estimatedPriceCzk: 120,
    fixedPriceCzk: null,
    driverName: 'Petr Svoboda',
    status: 'Completed',
  },
]

describe('exportOrdersToCsv', () => {
  it('returns a string starting with UTF-8 BOM', () => {
    const result = exportOrdersToCsv([])
    expect(result.startsWith('﻿')).toBe(true)
  })

  it('includes a header row as the first line', () => {
    const result = exportOrdersToCsv([])
    const lines = stripBom(result).split('\r\n')
    expect(lines[0]).toContain('Kód')
    expect(lines[0]).toContain('Telefon')
    expect(lines[0]).toContain('Stav')
  })

  it('returns only the header row for an empty set', () => {
    const result = exportOrdersToCsv([])
    const lines = stripBom(result).split('\r\n').filter(l => l.length > 0)
    expect(lines).toHaveLength(1)
  })

  it('serializes a data row correctly', () => {
    const result = exportOrdersToCsv(SAMPLE_ROWS)
    const lines = stripBom(result).split('\r\n').filter(l => l.length > 0)
    expect(lines).toHaveLength(2) // header + 1 data row
    const dataLine = lines[1]
    expect(dataLine).toContain('KL-0001')
    expect(dataLine).toContain('Jan Novák')
    expect(dataLine).toContain('+420777123456')
    expect(dataLine).toContain('Nádraží Kolín')
    expect(dataLine).toContain('Completed')
  })

  it('uses semicolon as delimiter', () => {
    const result = exportOrdersToCsv(SAMPLE_ROWS)
    const dataLine = stripBom(result).split('\r\n')[1]
    expect(dataLine).toContain(';')
  })

  it('quotes fields that contain a semicolon', () => {
    const rowWithSemicolon: CsvOrderRow = {
      ...SAMPLE_ROWS[0],
      pickupAddress: 'Praha; Hlavní nádraží',
    }
    const result = exportOrdersToCsv([rowWithSemicolon])
    const dataLine = stripBom(result).split('\r\n')[1]
    // The semicolon-containing field should be quoted
    expect(dataLine).toContain('"Praha; Hlavní nádraží"')
  })

  it('doubles internal double-quotes when quoting a field', () => {
    const rowWithQuote: CsvOrderRow = {
      ...SAMPLE_ROWS[0],
      customerName: 'He said "hello"',
    }
    const result = exportOrdersToCsv([rowWithQuote])
    const dataLine = stripBom(result).split('\r\n')[1]
    expect(dataLine).toContain('"He said ""hello"""')
  })

  it('quotes fields containing newline characters', () => {
    const rowWithNewline: CsvOrderRow = {
      ...SAMPLE_ROWS[0],
      customerName: 'Line1\nLine2',
    }
    const result = exportOrdersToCsv([rowWithNewline])
    const dataLine = stripBom(result).split('\r\n')[1]
    // Must be quoted because of newline inside
    expect(dataLine).toContain('"Line1\nLine2"')
  })

  it('preserves Czech diacritics correctly (not escaped)', () => {
    const rowWithDiacritics: CsvOrderRow = {
      ...SAMPLE_ROWS[0],
      customerName: 'Žofie Střížková',
    }
    const result = exportOrdersToCsv([rowWithDiacritics])
    expect(result).toContain('Žofie Střížková')
  })

  it('produces a filename with the current local date', () => {
    const filename = getCsvFilename()
    // Should look like objednavky-YYYY-MM-DD.csv
    expect(filename).toMatch(/^objednavky-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('shows ASAP when scheduledAt is null', () => {
    const result = exportOrdersToCsv(SAMPLE_ROWS)
    const dataLine = stripBom(result).split('\r\n')[1]
    expect(dataLine).toContain('ASAP')
  })

  it('shows scheduled time when scheduledAt is set', () => {
    const scheduledRow: CsvOrderRow = {
      ...SAMPLE_ROWS[0],
      scheduledAt: '2026-09-12T14:00:00.000Z',
    }
    const result = exportOrdersToCsv([scheduledRow])
    const dataLine = stripBom(result).split('\r\n')[1]
    // Should not show ASAP
    expect(dataLine).not.toContain('ASAP')
    // Should show some form of the date
    expect(dataLine).toContain('2026')
  })
})

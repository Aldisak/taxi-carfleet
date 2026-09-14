import { describe, it, expect, vi, afterEach } from 'vitest'
import { toCsv, downloadCsv } from './toCsv'

// The UTF-8 BOM character
const BOM = '﻿'
const CRLF = '\r\n'
const DELIM = ';'

describe('toCsv', () => {
  it('starts with UTF-8 BOM (byte-exact)', () => {
    const result = toCsv(['Col'], [])
    expect(result.charCodeAt(0)).toBe(0xFEFF)
  })

  it('includes the header row as the first line after BOM', () => {
    const result = toCsv(['Name', 'Value'], [])
    const firstLine = result.slice(1).split(CRLF)[0]
    expect(firstLine).toBe('Name;Value')
  })

  it('uses CRLF line endings throughout (byte-exact)', () => {
    const result = toCsv(['A', 'B'], [['x', 'y']])
    // All lines delimited by CRLF
    const withoutBom = result.slice(1)
    expect(withoutBom).toContain(CRLF)
    // Should NOT contain bare \n outside CRLF
    const nocrLf = withoutBom.replace(/\r\n/g, '')
    expect(nocrLf).not.toContain('\n')
  })

  it('uses semicolon as delimiter', () => {
    const result = toCsv(['A', 'B'], [['x', 'y']])
    const headerLine = result.slice(1).split(CRLF)[0]
    expect(headerLine).toBe(`A${DELIM}B`)
  })

  it('serializes a data row correctly', () => {
    const result = toCsv(['Name', 'Value'], [['Alice', '42']])
    const lines = result.slice(1).split(CRLF).filter(l => l.length > 0)
    expect(lines[0]).toBe('Name;Value')
    expect(lines[1]).toBe('Alice;42')
  })

  it('produces only the header row for an empty row array', () => {
    const result = toCsv(['A'], [])
    const lines = result.slice(1).split(CRLF).filter(l => l.length > 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('A')
  })

  it('quotes fields containing semicolons (RFC-4180)', () => {
    const result = toCsv(['X'], [['Praha; Hlavní']])
    expect(result).toContain('"Praha; Hlavní"')
  })

  it('doubles internal double-quotes when quoting (RFC-4180)', () => {
    const result = toCsv(['X'], [['say "hi"']])
    expect(result).toContain('"say ""hi"""')
  })

  it('quotes fields containing embedded newlines', () => {
    const result = toCsv(['X'], [['Line1\nLine2']])
    expect(result).toContain('"Line1\nLine2"')
  })

  it('quotes fields containing carriage return', () => {
    const result = toCsv(['X'], [['A\rB']])
    expect(result).toContain('"A\rB"')
  })

  it('does not quote plain fields without special chars', () => {
    const result = toCsv(['Name'], [['Alice']])
    const dataLine = result.slice(1).split(CRLF)[1]
    expect(dataLine).toBe('Alice')
    expect(dataLine).not.toContain('"')
  })

  it('handles multiple columns and rows', () => {
    const result = toCsv(['A', 'B', 'C'], [
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
    const lines = result.slice(1).split(CRLF).filter(l => l.length > 0)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('1;2;3')
    expect(lines[2]).toBe('4;5;6')
  })

  it('accepts number and null/undefined cells (coerces to string)', () => {
    const result = toCsv(['N', 'E'], [[42 as unknown as string, null as unknown as string]])
    const dataLine = result.slice(1).split(CRLF)[1]
    expect(dataLine).toBe('42;')
  })

  it('preserves Czech diacritics without escaping', () => {
    const result = toCsv(['Jméno'], [['Žofie Střížková']])
    expect(result).toContain('Žofie Střížková')
  })

  it('ends with a trailing CRLF', () => {
    const result = toCsv(['A'], [['x']])
    expect(result.endsWith(CRLF)).toBe(true)
  })

  it('byte-exact BOM + header + 1 data row + trailing CRLF', () => {
    const result = toCsv(['Name'], [['Alice']])
    expect(result).toBe(`${BOM}Name${CRLF}Alice${CRLF}`)
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL, clicks a transient anchor, and revokes the URL', () => {
    const createUrl = vi.fn().mockReturnValue('blob:mock')
    const revokeUrl = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadCsv('content', 'test.csv')

    expect(createUrl).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})

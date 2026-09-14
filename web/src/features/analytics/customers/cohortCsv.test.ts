/**
 * Byte tests for cohortCsv.ts — cohort retention triangle CSV builder.
 * Verifies UTF-8 BOM, ';' delimiter, CRLF line endings, and correct pivot.
 */

import { describe, it, expect } from 'vitest'
import type { CustomerCohortRowDto } from '../../../shared/api/client'
import { buildCohortCsv } from './cohortCsv'

const BOM = '﻿'

// Cohort rows: 2 acquisition months, each with monthsSince 0 and 1
const cohortRows: CustomerCohortRowDto[] = [
  { acqMonthLabel: '2026-07', monthsSince: 0, activeCustomers: 100 },
  { acqMonthLabel: '2026-07', monthsSince: 1, activeCustomers: 60 },
  { acqMonthLabel: '2026-08', monthsSince: 0, activeCustomers: 80 },
  { acqMonthLabel: '2026-08', monthsSince: 1, activeCustomers: 50 },
]

describe('buildCohortCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = buildCohortCsv(cohortRows)
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('uses semicolon as delimiter', () => {
    const csv = buildCohortCsv(cohortRows)
    const lines = csv.replace(BOM, '').split('\r\n')
    expect(lines[0]).toContain(';')
  })

  it('uses CRLF line endings', () => {
    const csv = buildCohortCsv(cohortRows)
    expect(csv).toContain('\r\n')
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('first header column is Kohorta', () => {
    const csv = buildCohortCsv(cohortRows)
    const headerLine = csv.replace(BOM, '').split('\r\n')[0]
    expect(headerLine.startsWith('Kohorta')).toBe(true)
  })

  it('pivots months-since as column headers (Měsíc 0, Měsíc 1 ...)', () => {
    const csv = buildCohortCsv(cohortRows)
    const headerLine = csv.replace(BOM, '').split('\r\n')[0]
    expect(headerLine).toContain('Měsíc 0')
    expect(headerLine).toContain('Měsíc 1')
  })

  it('one data row per acquisition month with correct counts', () => {
    const csv = buildCohortCsv(cohortRows)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    // header + 2 acq months
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-07;100;60')
    expect(lines[2]).toBe('2026-08;80;50')
  })

  it('returns header-only for empty input', () => {
    const csv = buildCohortCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('Kohorta')
  })
})

/**
 * Byte tests for driversCsv.ts — league table CSV builder.
 * Verifies UTF-8 BOM, ';' delimiter, CRLF line endings, and correct column values.
 */

import { describe, it, expect } from 'vitest'
import type { DriverLeagueRowDto } from '../../../shared/api/client'
import { buildLeagueTableCsv } from './driversCsv'

const BOM = '﻿'

const rowA: DriverLeagueRowDto = {
  driverId: 'aaa',
  name: 'Jan Novák',
  ridesCompleted: 20,
  revenueCzk: 10000,
  onlineHours: 8.5,
  utilizationPct: 75.0,
  revenuePerOnlineHour: 1176,
  acceptanceRate: 90.0,
  avgTimeToAcceptSeconds: 30,
  declinesAndTimeouts: 2,
  cancellations: 1,
  noShows: 0,
  avgRating: 4.8,
}

const rowB: DriverLeagueRowDto = {
  driverId: 'bbb',
  name: 'Petr; Dvořák', // contains semicolon — must be quoted
  ridesCompleted: 5,
  revenueCzk: 2000,
  onlineHours: 2.0,
  utilizationPct: 40.0,
  revenuePerOnlineHour: 1000,
  acceptanceRate: 60.0,
  avgTimeToAcceptSeconds: 60,
  declinesAndTimeouts: 3,
  cancellations: 0,
  noShows: 0,
  avgRating: null,
}

describe('buildLeagueTableCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = buildLeagueTableCsv([rowA])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('uses semicolon as delimiter', () => {
    const csv = buildLeagueTableCsv([rowA])
    const lines = csv.replace(BOM, '').split('\r\n')
    expect(lines[0]).toContain(';')
  })

  it('uses CRLF line endings', () => {
    const csv = buildLeagueTableCsv([rowA])
    expect(csv).toContain('\r\n')
    // Should not have bare \n
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('has the correct Czech column headers', () => {
    const csv = buildLeagueTableCsv([rowA])
    const headerLine = csv.replace(BOM, '').split('\r\n')[0]
    expect(headerLine).toBe('Řidič;Jízdy;Tržby (Kč);Online (hod.);Vytíženost (%);Tržby/hod.;Přijetí (%);Odmítnutí;Storna;No-show;Hodnocení')
  })

  it('maps numeric fields correctly for a single driver row', () => {
    const csv = buildLeagueTableCsv([rowA])
    const dataLine = csv.replace(BOM, '').split('\r\n')[1]
    expect(dataLine).toBe('Jan Novák;20;10000;8.5;75;1176;90;2;1;0;4.8')
  })

  it('renders null avgRating as empty string', () => {
    const csv = buildLeagueTableCsv([rowB])
    const dataLine = csv.replace(BOM, '').split('\r\n')[1]
    // last field is empty
    expect(dataLine.endsWith(';')).toBe(true)
  })

  it('quotes fields that contain semicolons', () => {
    const csv = buildLeagueTableCsv([rowB])
    const dataLine = csv.replace(BOM, '').split('\r\n')[1]
    expect(dataLine.startsWith('"Petr; Dvořák"')).toBe(true)
  })

  it('handles empty input', () => {
    const csv = buildLeagueTableCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only
  })
})

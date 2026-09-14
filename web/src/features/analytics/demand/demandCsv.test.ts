import { describe, it, expect } from 'vitest'
import type { HeatmapCellDto, ZonePickupDto, DemandTopRouteDto } from '../../../shared/api/client'
import { buildHeatmapCsv, buildZonePickupsCsv, buildTopRoutesCsv } from './demandCsv'

const BOM = '﻿'

describe('buildHeatmapCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildHeatmapCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('uses semicolon as delimiter', () => {
    const csv = buildHeatmapCsv([])
    // Header row should contain semicolons
    expect(csv).toContain(';')
  })

  it('uses CRLF line endings', () => {
    const csv = buildHeatmapCsv([])
    expect(csv).toContain('\r\n')
    expect(csv).not.toMatch(/[^\r]\n/)
  })

  it('header row: Hodina column + 7 DOW columns', () => {
    const csv = buildHeatmapCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    const headers = lines[0].split(';')
    // First column = hour label, then 7 days (Ne Po Út St Čt Pá So)
    expect(headers[0]).toBe('Hodina')
    expect(headers).toHaveLength(8)
  })

  it('has 24 data rows (one per hour)', () => {
    const csv = buildHeatmapCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    // 1 header + 24 data rows
    expect(lines).toHaveLength(25)
  })

  it('places cell counts in the correct hour/dow cell', () => {
    const cells: HeatmapCellDto[] = [
      { hour: 8, dow: 4, count: 5 }, // Thursday (index 4)
    ]
    const csv = buildHeatmapCsv(cells)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    // Hour 8 is line index 9 (0-indexed data: line[1]=hour0 … line[9]=hour8)
    const row8 = lines[9].split(';')
    expect(row8[0]).toBe('8:00')
    // DOW=4 → column index 5 (after "Hodina" at 0)
    expect(row8[5]).toBe('5')
  })

  it('exports 0 for cells with no data', () => {
    const csv = buildHeatmapCsv([])
    // All data cells should be 0
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    for (const line of lines.slice(1)) {
      const cols = line.split(';')
      for (const col of cols.slice(1)) {
        expect(col).toBe('0')
      }
    }
  })
})

describe('buildZonePickupsCsv', () => {
  it('starts with BOM', () => {
    const csv = buildZonePickupsCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('has correct headers: Zone and Pickups', () => {
    const csv = buildZonePickupsCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    const headers = lines[0].split(';')
    expect(headers[0]).toBe('Zóna')
    expect(headers[1]).toBe('Vyzvednutí')
  })

  it('emits one row per zone', () => {
    const zones: ZonePickupDto[] = [
      { zoneId: 'z1', zoneName: 'Centrum', pickupCount: 42 },
      { zoneId: 'z2', zoneName: 'Letiště', pickupCount: 18 },
    ]
    const csv = buildZonePickupsCsv(zones)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 zones
    expect(lines[1]).toContain('Centrum')
    expect(lines[1]).toContain('42')
  })
})

describe('buildTopRoutesCsv', () => {
  it('starts with BOM', () => {
    const csv = buildTopRoutesCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('has correct headers: Odkud, Kam, Počet', () => {
    const csv = buildTopRoutesCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    const headers = lines[0].split(';')
    expect(headers[0]).toBe('Odkud')
    expect(headers[1]).toBe('Kam')
    expect(headers[2]).toBe('Počet')
  })

  it('emits one row per route', () => {
    const routes: DemandTopRouteDto[] = [
      { pickupAddress: 'Náměstí Míru', dropoffAddress: 'Letiště Václava Havla', count: 15 },
    ]
    const csv = buildTopRoutesCsv(routes)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2) // header + 1 route
    expect(lines[1]).toContain('Náměstí Míru')
    expect(lines[1]).toContain('Letiště Václava Havla')
    expect(lines[1]).toContain('15')
  })
})

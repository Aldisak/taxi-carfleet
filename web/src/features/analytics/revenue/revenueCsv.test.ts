/**
 * Unit tests for revenueCsv.ts — byte-exact CSV output for revenue tables.
 */

import { describe, it, expect } from 'vitest'
import type { RevenueTopRouteDto, ZoneRevenueDto } from '../../../shared/api/client'
import { buildRevenueTopRoutesCsv, buildZoneRevenueCsv } from './revenueCsv'

const BOM = '﻿'

// ── buildRevenueTopRoutesCsv ──────────────────────────────────────────────────

describe('buildRevenueTopRoutesCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildRevenueTopRoutesCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('uses semicolon as delimiter', () => {
    const csv = buildRevenueTopRoutesCsv([])
    expect(csv).toContain(';')
  })

  it('uses CRLF line endings', () => {
    const csv = buildRevenueTopRoutesCsv([])
    expect(csv).toContain('\r\n')
    expect(csv).not.toMatch(/[^\r]\n/)
  })

  it('has correct headers: Odkud, Kam, Jízdy, Tržby (Kč), AOV (Kč)', () => {
    const csv = buildRevenueTopRoutesCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    const headers = lines[0].split(';')
    expect(headers[0]).toBe('Odkud')
    expect(headers[1]).toBe('Kam')
    expect(headers[2]).toBe('Jízdy')
    expect(headers[3]).toBe('Tržby (Kč)')
    expect(headers[4]).toBe('AOV (Kč)')
    expect(headers).toHaveLength(5)
  })

  it('emits one row per route', () => {
    const routes: RevenueTopRouteDto[] = [
      { pickupAddress: 'Náměstí Míru', dropoffAddress: 'Letiště VH', rides: 5, revenueCzk: 2500, aovCzk: 500 },
      { pickupAddress: 'Hlavní nádraží', dropoffAddress: 'Centrum', rides: 3, revenueCzk: 1200, aovCzk: 400 },
    ]
    const csv = buildRevenueTopRoutesCsv(routes)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 routes
    expect(lines[1]).toContain('Náměstí Míru')
    expect(lines[1]).toContain('Letiště VH')
    expect(lines[1]).toContain('5')
    expect(lines[1]).toContain('2500')
    expect(lines[1]).toContain('500')
  })

  it('handles empty array', () => {
    const csv = buildRevenueTopRoutesCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only
  })
})

// ── buildZoneRevenueCsv ────────────────────────────────────────────────────────

describe('buildZoneRevenueCsv', () => {
  it('starts with a UTF-8 BOM', () => {
    const csv = buildZoneRevenueCsv([])
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('uses semicolon as delimiter', () => {
    const csv = buildZoneRevenueCsv([])
    expect(csv).toContain(';')
  })

  it('uses CRLF line endings', () => {
    const csv = buildZoneRevenueCsv([])
    expect(csv).toContain('\r\n')
    expect(csv).not.toMatch(/[^\r]\n/)
  })

  it('has correct headers: Zóna, Jízdy, Tržby (Kč), AOV (Kč)', () => {
    const csv = buildZoneRevenueCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    const headers = lines[0].split(';')
    expect(headers[0]).toBe('Zóna')
    expect(headers[1]).toBe('Jízdy')
    expect(headers[2]).toBe('Tržby (Kč)')
    expect(headers[3]).toBe('AOV (Kč)')
    expect(headers).toHaveLength(4)
  })

  it('emits one row per zone', () => {
    const zones: ZoneRevenueDto[] = [
      { zoneId: 'zone-1', zoneName: 'Centrum', rides: 10, revenueCzk: 5000, aovCzk: 500 },
      { zoneId: 'zone-2', zoneName: 'Letiště', rides: 5, revenueCzk: 3500, aovCzk: 700 },
    ]
    const csv = buildZoneRevenueCsv(zones)
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 zones
    expect(lines[1]).toContain('Centrum')
    expect(lines[1]).toContain('10')
    expect(lines[1]).toContain('5000')
    expect(lines[1]).toContain('500')
  })

  it('handles empty array', () => {
    const csv = buildZoneRevenueCsv([])
    const lines = csv.replace(BOM, '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only
  })
})

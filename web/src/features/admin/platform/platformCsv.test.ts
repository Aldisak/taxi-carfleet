import { describe, it, expect } from 'vitest'
import { buildPlatformCsv } from './platformCsv'
import type { FleetHealthRow } from '../../../shared/api/client'

function row(overrides?: Partial<FleetHealthRow>): FleetHealthRow {
  return {
    fleetId: '11111111-1111-1111-1111-111111111111',
    fleetName: 'Taxi Demo',
    ridesThisMonth: 120,
    ridesLastMonth: 100,
    revenueThisMonthCzk: 240000,
    revenueLastMonthCzk: 200000,
    momDeltaPct: 20,
    activeDrivers: 8,
    activeCustomers: 60,
    smsCount: 300,
    smsEstimatedCostCzk: 900,
    lastOrderAt: '2026-09-14T08:00:00Z',
    sparklineWeeks: [1, 2, 3],
    health: 'growing',
    ...overrides,
  }
}

const HEADERS = [
  'Flotila',
  'Jízdy tento měsíc',
  'Jízdy minulý měsíc',
  'MoM %',
  'Tržby tento měsíc (Kč)',
  'Aktivní řidiči',
  'Aktivní zákazníci',
  'SMS',
  'Odhad. cena SMS (Kč)',
  'Poslední objednávka',
  'Zdraví',
]

describe('buildPlatformCsv', () => {
  it('starts with a UTF-8 BOM and uses ; delimiter + CRLF', () => {
    const csv = buildPlatformCsv([row()], HEADERS, {
      health: (h) => h,
      lastOrder: (iso) => iso ?? '',
    })
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.includes(';')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('emits the header row followed by one data row per fleet (raw integer CZK, no formatting)', () => {
    const csv = buildPlatformCsv([row()], HEADERS, {
      health: (h) => `H:${h}`,
      lastOrder: () => '14.09.2026',
    })
    const lines = csv.replace('﻿', '').split('\r\n').filter(Boolean)
    expect(lines[0]).toBe(HEADERS.join(';'))
    expect(lines[1]).toBe(
      'Taxi Demo;120;100;20;240000;8;60;300;900;14.09.2026;H:growing',
    )
  })

  it('quotes a fleet name that contains the delimiter', () => {
    const csv = buildPlatformCsv([row({ fleetName: 'Taxi; s.r.o.' })], HEADERS, {
      health: (h) => h,
      lastOrder: () => '',
    })
    expect(csv).toContain('"Taxi; s.r.o."')
  })
})

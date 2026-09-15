import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  FORBIDDEN_HOSTS,
  scanForForbiddenHosts,
  defaultScanRoots,
} from '../../../scripts/check-no-osm.mjs'

// UC-010 AC#1: OpenStreetMap tiles, OSRM routing, Nominatim geocoding and Photon
// autocomplete were all replaced by the Mapy.com REST API behind our backend proxy.
// This guard fails the suite the moment any of the four legacy hosts reappears in
// product source (web/src or api/src). The host string literals live only in
// web/scripts/check-no-osm.mjs (outside the scan roots), so the guard never trips
// on itself.
describe('legacy map hosts guard', () => {
  it('finds no legacy OSM/OSRM/Nominatim/Photon host in web/src or api/src', async () => {
    const violations = await scanForForbiddenHosts(defaultScanRoots())
    // Surface the offending files in the failure message for a fast fix.
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
  })

  it('actually catches a planted forbidden host (guard is not a no-op)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'osm-guard-'))
    try {
      const planted = path.join(dir, 'planted.ts')
      await writeFile(
        planted,
        `export const url = 'https://${FORBIDDEN_HOSTS[3]}/{z}/{x}/{y}.png'\n`,
        'utf8',
      )
      const violations = await scanForForbiddenHosts([dir])
      expect(violations).toHaveLength(1)
      expect(violations[0].host).toBe(FORBIDDEN_HOSTS[3])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

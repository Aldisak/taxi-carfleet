/**
 * CI guard (UC-010 AC#1): fail if any legacy OSM/OSRM/Nominatim/Photon host reappears.
 *
 * UC-010 replaced OpenStreetMap tiles + OSRM routing + Nominatim geocoding + Photon
 * autocomplete with the Mapy.com REST API behind our backend proxy. These four hosts
 * must never be re-introduced into product code. This script greps `web/src` and
 * `api/src` (source only — docs, specs, node_modules and this scripts/ folder are
 * excluded) and exits non-zero if any forbidden host is found.
 *
 * It lives under `web/scripts/` (NOT `web/src`) on purpose: the forbidden-host string
 * literals below would otherwise trip the very guard that greps `web/src`. Keeping the
 * pattern list here means the scan never matches itself. The vitest guard
 * (`noLegacyMapHosts.test.ts`) imports `FORBIDDEN_HOSTS` + `scanForForbiddenHosts` from
 * this module so there are zero forbidden literals under `web/src`.
 *
 * Usage: `node web/scripts/check-no-osm.mjs` or `npm run check:geo` (from web/).
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** Legacy map-provider hosts that must never reappear in product source. */
export const FORBIDDEN_HOSTS = [
  'router.project-osrm.org',
  'nominatim.openstreetmap.org',
  'photon.komoot.io',
  'tile.openstreetmap.org',
]

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.cs',
  '.json',
])

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'bin',
  'obj',
  'dist',
  '.vite',
  'coverage',
])

async function collectCodeFiles(rootDirectory) {
  const files = []

  async function walk(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      // Directory does not exist in this checkout (e.g. running from web/ without api/).
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue
        await walk(fullPath)
      } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath)
      }
    }
  }

  await walk(rootDirectory)
  return files
}

/**
 * Scan the given root directories for any forbidden host. Returns an array of
 * { file, host, line } violations (empty when clean).
 */
export async function scanForForbiddenHosts(rootDirectories) {
  const violations = []
  for (const root of rootDirectories) {
    const files = await collectCodeFiles(root)
    for (const file of files) {
      const content = await readFile(file, 'utf8')
      const lines = content.split(/\r?\n/)
      lines.forEach((text, index) => {
        for (const host of FORBIDDEN_HOSTS) {
          if (text.includes(host)) {
            violations.push({ file, host, line: index + 1 })
          }
        }
      })
    }
  }
  return violations
}

/** Default scan roots relative to the repo: web/src and api/src. */
export function defaultScanRoots() {
  const here = path.dirname(fileURLToPath(import.meta.url)) // web/scripts
  const repoRoot = path.resolve(here, '..', '..')
  return [path.join(repoRoot, 'web', 'src'), path.join(repoRoot, 'api', 'src')]
}

// CLI entrypoint: run the scan and exit non-zero on any violation.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-no-osm.mjs')) {
  const violations = await scanForForbiddenHosts(defaultScanRoots())
  if (violations.length > 0) {
    console.error('Forbidden legacy map hosts found (UC-010 AC#1):')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} → ${v.host}`)
    }
    process.exit(1)
  }
  console.log('check:geo OK — no legacy OSM/OSRM/Nominatim/Photon hosts in web/src or api/src')
}
